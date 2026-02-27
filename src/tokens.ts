import { AccessTokenResponse, ClientTokenResponse } from "../types/SpotifyAPI";
import { CORE_HEADERS } from "./const";
import { getSpotifyTOTP } from "./totp";

const getAccessTokenInternal = async (cookies: string) => {
  if (!cookies) {
    throw new Error("Cookies are required to get access token");
  }

  const { totp, version } = await getSpotifyTOTP();

  const response = await fetch(
    `https://open.spotify.com/api/token?reason=init&productType=web-player&totp=${totp}&totpServer=${totp}&totpVer=${version}`,
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

  return await response.json() as AccessTokenResponse;
};

const getClientTokenInternal = async (client_id: string, device_id: string) => {
  const payload = {
    client_data: {
      client_version: "1.2.85.285.g95337383",
      client_id,
      js_sdk_data: {
        device_brand: "Apple",
        device_model: "unknown",
        os: "macos",
        os_version: "10.15.7",
        device_id,
        device_type: "computer"
      }
    }
  };

  const response = await fetch(
    "https://clienttoken.spotify.com/v1/clienttoken",
    {
      method: "POST",
      headers: {
        ...CORE_HEADERS,
        "Origin": "https://open.spotify.com",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`Failed to get client token (${response.status}): ${text}`);
  }

  return await response.json() as ClientTokenResponse;
};

export const getAccessToken = async (kv: KVNamespace, cookies: string) => {
  const hasAccessToken = await kv.get("spotify_access_token");
  const hasClientId = await kv.get("spotify_client_id");
  if (hasAccessToken === null || hasClientId === null) {
    const tokenResp = await getAccessTokenInternal(cookies);
    await kv.put("spotify_access_token", tokenResp.accessToken, {
      expiration: tokenResp.accessTokenExpirationTimestampMs / 1000,
    });
    await kv.put("spotify_client_id", tokenResp.clientId, {
      expiration: tokenResp.accessTokenExpirationTimestampMs / 1000,
    });
    return {
      accessToken: tokenResp.accessToken,
      clientId: tokenResp.clientId,
    };
  }
  return {
    accessToken: hasAccessToken,
    clientId: hasClientId,
  } as {
    accessToken: string;
    clientId: string;
  };
};

export const getClientToken = async (kv: KVNamespace, client_id: string, device_id: string) => {
  const hasClientToken = await kv.get("spotify_client_token");
  if (hasClientToken === null) {
    const tokenResp = await getClientTokenInternal(client_id, device_id);
    await kv.put("spotify_client_token", tokenResp.granted_token.token, {
      expiration: Math.floor(Date.now() / 1000) + tokenResp.granted_token.expires_after_seconds,
    });
    return tokenResp.granted_token.token;
  }
  return hasClientToken;
};
