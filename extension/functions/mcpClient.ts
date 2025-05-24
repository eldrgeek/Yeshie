import { io, Socket } from "socket.io-client";
import type { LogEntry } from "./logger";

let socket: Socket | null = null;

export function initMCPClient(url: string = "http://localhost:8123") {
  socket = io(url);
  socket.on("connect", () => {
    console.debug("[MCP] connected", socket?.id);
  });
}

export function sendLogEntry(entry: LogEntry) {
  if (socket && socket.connected) {
    socket.emit("log_entry", entry);
  }
}

export function onActions(handler: (data: any) => void) {
  if (!socket) return;
  socket.on("actions", handler);
}
