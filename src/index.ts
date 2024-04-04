import { Hono } from "hono";
import { connectState, getAccessToken, getDealerURL } from "./spotify";
import type { WebSocket as CFWebSocket } from "@cloudflare/workers-types";
import { defaultSpotifyDevice } from "./const";

type Bindings = {
  kv: KVNamespace;
  SP_COOKIES: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", async (c) => {
  const upgradeHeader = c.req.header("Upgrade");
  if (upgradeHeader !== "websocket") {
    return c.redirect("https://www.youtube.com/watch?v=FfnQemkjPjM", 302);
  }

  try {
    const accessToken = await getAccessToken(c.env.kv, c.env.SP_COOKIES);
    const dealerURL = await getDealerURL(accessToken);

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
      console.log(dealerResp);
      throw new Error("server didn't accept WebSocket");
    }

    dealerSocket.accept();

    dealerSocket.addEventListener("message", async (msg) => {
      let connection_id = "";
      const json = JSON.parse(msg.data as string);
      if (json.type === "message") {
        if (json.headers["Spotify-Connection-Id"] !== undefined) {
          connection_id = json.headers["Spotify-Connection-Id"];

          const cluster = await connectState(
            connection_id,
            accessToken,
            defaultSpotifyDevice
          );

          server.send(JSON.stringify(cluster.player_state));
        } else if (json.uri == "hm://connect-state/v1/cluster") {
          server.send(JSON.stringify(json.payloads[0].cluster.player_state));
        }
      }
    });

    dealerSocket.addEventListener("close", async (msg) => {
      console.log("Dealer closed", msg);
      await server.close();
    });

    dealerSocket.addEventListener("error", async (msg) => {
      console.log("Dealer error", msg);
      await server.close();
    });

    server.addEventListener("close", async (msg) => {
      console.log("Server closed", msg);
      await dealerSocket.close();
    });

    server.addEventListener("error", async (msg) => {
      console.log("Server error", msg);
      await server.close();
    });

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
