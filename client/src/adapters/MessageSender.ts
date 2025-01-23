import { Socket } from "socket.io-client";
import { IMessageSender } from "@yeshie/shared";

export class SocketMessageSender implements IMessageSender {
  constructor(private socket: Socket | null) {}

  async sendLLMMessage(content: string, sessionId: string): Promise<void> {
    if (!this.socket) {
      throw new Error("Socket not connected");
    }
    this.socket.emit("monitor", { op: "llm", from: sessionId, content });
  }

  async sendCommandMessage(content: string): Promise<void> {
    const lines = content.split("\n").filter(line => line.trim());

    const sendLine = (index: number) => {
      if (index >= lines.length) return;

      const line = lines[index].trim();
      if (!line.startsWith("//")) {
        if (line.startsWith('message ')) {
          // Message will be handled by notifications
          return;
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { type: "monitor", op: "command", line },
            "*"
          );
        }
      }
      setTimeout(() => sendLine(index + 1), 1000);
    };

    sendLine(0);
  }
} 