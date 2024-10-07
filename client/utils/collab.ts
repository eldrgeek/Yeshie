// utils/collab.ts

import { Socket } from "socket.io-client";
import { Text } from "@codemirror/state";
import {
  receiveUpdates,
  sendableUpdates,
  collab,
  getSyncedVersion,
} from "@codemirror/collab";
import { ViewPlugin, EditorView } from "@codemirror/view";

// Function to get the initial document state
export async function getDocument(socket: Socket): Promise<{ version: number; doc: Text }> {
  return new Promise((resolve) => {
    socket.emit("getDocument");
    socket.once("getDocumentResponse", (version: number, doc: string) => {
      resolve({ version, doc: Text.of(doc.split("\n")) });
    });
  });
}

// Function to pull updates from the server
async function pullUpdates(socket: Socket, version: number) {
  return new Promise((resolve) => {
    socket.emit("pullUpdates", version);
    socket.once("pullUpdateResponse", (updates) => {
      resolve(JSON.parse(updates));
    });
  });
}

// Function to push updates to the server
async function pushUpdates(socket: Socket, version: number, updates: any[]) {
  return new Promise((resolve) => {
    socket.emit("pushUpdates", version, JSON.stringify(updates));
    socket.once("pushUpdateResponse", (success) => {
      resolve(success);
    });
  });
}

// The main peerExtension function
export function peerExtension(socket: Socket | null, startVersion: number) {
    // Ensure the function returns an array with the collab extension and the plugin
    let plugin = ViewPlugin.fromClass(
    class {
      private pushing = false;
      private done = false;

      constructor(private view: EditorView) {
        this.pull();
      }

      update(update: any) {
        if (update.docChanged || update.transactions.length) this.push();
      }

      async pull() {
        if(!socket) return
        while (!this.done) {
          let version = getSyncedVersion(this.view.state);
          let updates = await pullUpdates(socket, version);
          this.view.dispatch(receiveUpdates(this.view.state, updates as any));
        }
      }

      async push() {
        if (this.pushing) return;
        if(!socket) return
        this.pushing = true;
        while (this.pushing) {
          let updates = sendableUpdates(this.view.state);
          if (!updates.length) break;
          let version = getSyncedVersion(this.view.state);
          let success = await pushUpdates(socket, version, updates as any[]);
          if (!success) {
            this.view.dispatch(receiveUpdates(this.view.state, updates));
            break;
          }
        }
        this.pushing = false;
      }

      destroy() {
        this.done = true;
        
      }
    }
  );

  // Ensure the return value is an array with collab and the plugin
  return [collab({ startVersion }), plugin]; // Ensure this is correct
}