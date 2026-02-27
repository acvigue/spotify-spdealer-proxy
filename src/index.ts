import { Hono } from "hono";
import { connectState, fetchTrackDetails, getDealerURL } from "./api";
import { getAccessToken, getClientToken } from "./tokens";
import type { WebSocket as CFWebSocket } from "@cloudflare/workers-types";
import { defaultSpotifyDevice } from "./const";type Bindings = {
  kv: KVNamespace;
  SP_COOKIES: string;
};

const app = new Hono<{ Bindings: Bindings }>();

const SCDN_IMAGE_URL = "https://i.scdn.co/image";

const filterTrackData = (track: any) => ({
  name: track.name,
  uri: track.canonical_uri,
  duration_ms: track.duration,
  disc_number: track.disc_number,
  track_number: track.number,
  popularity: track.popularity,
  artists: track.artist?.map((a: any) => ({ name: a.name })),
  album: {
    name: track.album?.name,
    release_date: track.album?.date,
    images: track.album?.cover_group?.image?.map((img: any) => ({
      url: `${SCDN_IMAGE_URL}/${img.file_id}`,
      width: img.width,
      height: img.height,
    })),
  },
});

const filterPlayerState = async (state: any, token: string, clientToken: string) => {
  const trackId = state.track?.uri?.split(":")?.[2];
  if (!trackId) return null;

  const trackData = await fetchTrackDetails(trackId, token, clientToken);

  return {
    is_playing: state.is_playing,
    is_paused: state.is_paused,
    position_ms: Number(state.position_as_of_timestamp),
    timestamp: Number(state.timestamp),
    track: filterTrackData(trackData),
  };
};

app.get("/", async (c) => {
  try {
    const accessToken = await getAccessToken(c.env.kv, c.env.SP_COOKIES);
    const clientToken = await getClientToken(c.env.kv, accessToken.clientId, defaultSpotifyDevice.device_id);
    const dealerURL = getDealerURL(accessToken.accessToken);

    const webSocketPair = new WebSocketPair();
    const client = webSocketPair[0];
    const server = webSocketPair[1] as unknown as CFWebSocket;
    server.accept();

    const dealerResp = await fetch(dealerURL, {
      headers: {
        Upgrade: "websocket",
      },
    });

    const dealerSocket = dealerResp.webSocket;
    if (!dealerSocket) {
      const errorText = await dealerResp.text();
      throw new Error(
        `server didn't accept WebSocket (${dealerResp.status}): ${errorText}`
      );
    }

    dealerSocket.accept();

    dealerSocket.addEventListener("message", async (msg) => {
      let connection_id = "";
      const json = JSON.parse(msg.data as string);
      if (json.type === "message") {
        if (json.headers["Spotify-Connection-Id"] !== undefined) {
          connection_id = json.headers["Spotify-Connection-Id"];

          const cluster = await connectState(
            c.env.kv,
            connection_id,
            accessToken.clientId,
            accessToken.accessToken,
            defaultSpotifyDevice
          );


          const state = await filterPlayerState(cluster.player_state, accessToken.accessToken, clientToken);

          server.send(JSON.stringify(state));
        } else if (json.uri == "hm://connect-state/v1/cluster") {
          const state = await filterPlayerState(json.payloads[0].cluster.player_state, accessToken.accessToken, clientToken);
          server.send(
            JSON.stringify(
              state
            )
          );
        }
      }
    });

    dealerSocket.addEventListener("close", async () => server.close());
    dealerSocket.addEventListener("error", async () => server.close());
    server.addEventListener("close", async () => dealerSocket.close());
    server.addEventListener("error", async () => server.close());

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  } catch (e) {
    console.error(e);
    if (e instanceof Error) {
      return c.text(e.message, 500);
    }
    return c.text("Unknown error", 500);
  }
});

export default app;
