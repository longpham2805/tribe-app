import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { subscribe } from "../lib/events";

export function attachWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "hello" }));
  });

  subscribe((event) => {
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  });

  console.log("[ws] WebSocket attached at /ws");
}
