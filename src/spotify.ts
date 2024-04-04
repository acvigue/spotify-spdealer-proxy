import { SpotifyCluster } from "../types/SpotifyCluster";
import { CORE_HEADERS } from "./const";

const getAccessTokenInternal = async (cookies: string) => {
  const response = await fetch(
    "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
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

export const getAccessToken = async (kv: KVNamespace, cookies: string) => {
  const hasAccessToken = await kv.get("access_token");
  if (hasAccessToken === null) {
    const tokenResp = await getAccessTokenInternal(cookies);
    await kv.put("access_token", tokenResp.accessToken, {
      expirationTtl: tokenResp.accessTokenExpirationTimestampMs / 1000,
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
