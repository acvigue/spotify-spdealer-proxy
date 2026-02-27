import { SpotifyCluster } from "../types/SpotifyCluster";
import { SpotifyDevice } from "../types/SpotifyDevice";
import { APP_PLATFORM, CORE_HEADERS, SPOTIFY_APP_VERSION } from "./const";
import { getClientToken } from "./tokens";

const SPOTIFY_BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const spotifyIdToHex = (id: string): string => {
  let num = 0n;
  for (const char of id) {
    num = num * 62n + BigInt(SPOTIFY_BASE62.indexOf(char));
  }
  return num.toString(16).padStart(32, '0');
};

export const getDealerURL = (accessToken: string) => {
  return `https://guc3-dealer.spotify.com:443/?access_token=${accessToken}`;
};

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

export const connectState = async (
  kv: KVNamespace,
  connectionID: string,
  clientID: string,
  accessToken: string,
  device: SpotifyDevice
) => {
  const clientToken = await getClientToken(kv, clientID, device.device_id);

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
        "accept": "application/json",
        "authorization": `Bearer ${accessToken}`,
        "client-token": clientToken,
        "content-type": "application/json",
        "origin": "https://open.spotify.com",
        "x-spotify-connection-id": connectionID,
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

export const fetchTrackDetails = async (
  trackID: string,
  accessToken: string,
  clientToken: string
) => {
  const hexId = spotifyIdToHex(trackID);

  const response = await fetch(
    `https://spclient.wg.spotify.com/metadata/4/track/${hexId}?market=from_token`,
    {
      method: "GET",
      headers: {
        ...CORE_HEADERS,
        "authorization": `Bearer ${accessToken}`,
        "client-token": clientToken,
        "app-platform": APP_PLATFORM,
        "spotify-app-version": SPOTIFY_APP_VERSION,
        "accept": "application/json",
        "accept-language": "en",
      },
    }
  );

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Failed to fetch track details (${response.status}): ${text}`);
  }

  return await response.json();
};
