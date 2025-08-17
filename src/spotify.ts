import { SpotifyCluster } from "../types/SpotifyCluster";
import { CORE_HEADERS } from "./const";

interface SpotifyTOTPSecretItem {
  version: number;
  secret: number[];
}

const getSpotifyTOTPSecret = async () => {
  const url = 'https://raw.githubusercontent.com/Thereallo1026/spotify-secrets/refs/heads/main/secrets/secretBytes.json';
  const resp = await fetch(url);
  if (resp.status !== 200) {
    throw new Error(`Failed to fetch Spotify TOTP secret (${resp.status})`);
  }
  const data: SpotifyTOTPSecretItem[] = await resp.json();

  //get the latest version
  const latestVersion = data.reduce((max, item) => Math.max(max, item.version), 0);
  const latestItem = data.find(item => item.version === latestVersion);
  if (!latestItem) {
    throw new Error("No valid Spotify TOTP secret found");
  }

  return latestItem;
}

// Helper functions for secret processing

const processSecret = (cipherBytes: number[]): Uint8Array => {
  // Apply the cipher transformation: e ^ ((t % 33) + 9)
  const transformed = cipherBytes.map((e, t) => e ^ ((t % 33) + 9));

  console.log(`TOTP cipher: ${cipherBytes}`);
  console.log(`Transformed: ${transformed}`);

  // Join the transformed numbers as strings
  const joined = transformed.map(num => num.toString()).join('');

  console.log(`Joined: ${joined}`);

  // Encode as UTF-8 then convert to hex
  const encoder = new TextEncoder();
  const utf8Bytes = encoder.encode(joined);
  const hexStr = Array.from(utf8Bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  console.log(`Hex string: ${hexStr}`);

  // Convert hex to bytes for base32 encoding
  const hexBytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    hexBytes.push(parseInt(hexStr.substr(i, 2), 16));
  }

  // Base32 encode and remove padding
  const secret = base32Encode(new Uint8Array(hexBytes)).replace(/=+$/, '');

  console.log(`Computed secret: ${secret}`);

  // Decode the base32 secret back to bytes for HMAC
  return base32Decode(secret);
};

// Standard Base32 encoding
const base32Encode = (bytes: Uint8Array): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  // Add padding
  while (result.length % 8 !== 0) {
    result += '=';
  }

  return result;
};

// Standard Base32 decoding
const base32Decode = (encoded: string): Uint8Array => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of encoded.toUpperCase()) {
    if (char === '=') break;

    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
};// Generate TOTP using Web Crypto API
const generateTOTP = async (cipherBytes: number[], timeStep: number = 30, digits: number = 6): Promise<string> => {
  // Process the cipher bytes to get the actual key
  const key = processSecret(cipherBytes);
  console.log(`Generated key: ${Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('')}`);

  // Calculate time step (current time / 30 seconds)
  const time = Math.floor(Date.now() / 1000 / timeStep);

  // Convert time to 8-byte big-endian buffer
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time, false); // big-endian

  // Import the key for HMAC-SHA1
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  // Generate HMAC-SHA1
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, timeBuffer);
  const hmac = new Uint8Array(signature);

  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) >>> 0;

  // Generate the final OTP
  const otp = (truncated % Math.pow(10, digits)).toString().padStart(digits, '0');
  return otp;
};



const getAccessTokenInternal = async (cookies: string) => {
  if (!cookies) {
    throw new Error("Cookies are required to get access token");
  }

  const { totp, version } = await getSpotifyTOTP();

  console.log(`Using TOTP: ${totp} (version: ${version})`);
  console.log(`Cookies: ${cookies}`);

  const response = await fetch(
    `https://open.spotify.com/api/token?reason=init&productType=web_player&totp=${totp}&totpServer=${totp}&totpVer=${version}`,
    {
      method: "GET",
      headers: {
        Cookie: cookies,
        ...CORE_HEADERS,
      },
    }
  );

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Failed to get access token (${response.status}): ${text}`);
  }

  const json: any = await response.json();
  return json as {
    accessToken: string;
    accessTokenExpirationTimestampMs: number;
  };
};

export const getDealerURL = async (accessToken: string) => {
  return `https://guc3-dealer.spotify.com:443/?access_token=${accessToken}`;
};

export const getSpotifyTOTP = async () => {
  const { secret, version } = await getSpotifyTOTPSecret();
  return {
    totp: await generateTOTP(secret, 30, 6),
    version
  }
};

export const getAccessToken = async (kv: KVNamespace, cookies: string) => {
  const hasAccessToken = await kv.get("spotify_access_token");
  if (hasAccessToken === null) {
    const tokenResp = await getAccessTokenInternal(cookies);
    await kv.put("spotify_access_token", tokenResp.accessToken, {
      expiration: tokenResp.accessTokenExpirationTimestampMs / 1000,
    });
    return tokenResp.accessToken;
  }
  return hasAccessToken;
};

/**
 * Metadata required when registering a device with Spotify
 */
export interface SpotifyDevice {
  /**
   * The brand of the device (e.g. Spotify, Sonos, etc.)
   */
  brand: string;
  capabilities: {
    audio_podcasts: boolean;
    change_volume: boolean;
    disable_connect: boolean;
    enable_play_token: boolean;
    manifest_formats: string[];
    play_token_lost_behavior: string;
    supports_file_media_type: boolean;
    video_playback: boolean;
  };
  device_id: string;
  device_type: string;
  metadata: Record<string, string>;
  model: string;
  name: string;
  platform_identifier: string;
}

/**
 * Subscribes a connection to notifications for a user
 * @param connectionID ID of the connection to subscribe
 * @param accessToken token representing the user to subscribe to
 */
export const subscribeToNotifications = async (
  connectionID: string,
  accessToken: string
) => {
  const response = await fetch(
    `https://api.spotify.com/v1/me/notifications/user?connection_id=${encodeURIComponent(
      connectionID
    )}`,
    {
      method: "PUT",
      headers: {
        ...CORE_HEADERS,
        authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new Error(
      `Failed to subscribe to notifications (${response.status}): ${text}`
    );
  }
};

export const trackPlayback = async (
  connectionID: string,
  accessToken: string,
  device: SpotifyDevice
) => {
  const requestBody = {
    client_version: "harmony:4.21.0-a4bc573",
    connection_id: connectionID,
    device,
    outro_endcontent_snooping: false,
    volume: 65535,
  };

  const response = await fetch(
    "https://guc-spclient.spotify.com/track-playback/v1/devices",
    {
      method: "POST",
      headers: {
        ...CORE_HEADERS,
        origin: "https://open.spotify.com",
        authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (response.status !== 204) {
    const text = await response.text();
    throw new Error(`Failed to track playback (${response.status}): ${text}`);
  }
};

/**
 * Connects the cluster state to a connection
 * @param connectionID ID of the connection to connect
 * @param accessToken token representing the user to connect to
 * @param device device associated to the connection
 */
export const connectState = async (
  connectionID: string,
  accessToken: string,
  device: SpotifyDevice
) => {
  const requestBody = {
    device: {
      device_info: {
        capabilities: {
          can_be_player: false,
          hidden: true,
          needs_full_player_state: true,
        },
      },
    },
    member_type: "CONNECT_STATE",
  };

  const response = await fetch(
    `https://guc3-spclient.spotify.com/connect-state/v1/devices/hobs_${device.device_id}`,
    {
      method: "PUT",
      headers: {
        ...CORE_HEADERS,
        authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Spotify-Connection-ID": connectionID,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Failed to connect state (${response.status}): ${text}`);
  }

  const json = await response.json();

  return json as SpotifyCluster;
};

/**
 * Fetches the current state of the cluster
 * @param trackID ID of the track to fetch
 * @param accessToken token representing the user to fetch from
 */
export const fetchTrackDetails = async (
  trackID: string,
  accessToken: string
) => {
  const response = await fetch(
    `https://api.spotify.com/v1/tracks/${trackID}`,
    {
      method: "GET",
      headers: {
        ...CORE_HEADERS,
        authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Failed to fetch track details (${response.status}): ${text}`);
  }

  const json = await response.json() as any;

  const json2 = {
    album: json.album,
    artists: json.artists,
    name: json.name,
    external_urls: json.external_urls,
    explicit: json.explicit,
  };

  return json2;
};