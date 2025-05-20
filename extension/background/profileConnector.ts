import { io, Socket } from "socket.io-client";
import { storageGet } from "../functions/storage";
import { logInfo, logError } from "../functions/logger";
import { APPLICATION_TABS_KEY, TabInfo } from "./tabHistory";

export interface ProfileTabs {
  profile: string;
  windows: Record<string, TabInfo[]>;
}

const MCP_URL = "http://localhost:8123";

let socket: Socket | null = null;
let profileName = "unknown";
const profiles: Record<string, Record<string, TabInfo[]>> = {};

export async function initProfileConnector() {
  profileName = await getProfileName();
  try {
    socket = io(MCP_URL);
    socket.on("connect", () => {
      logInfo("ProfileConnector", "Connected to MCP", { profile: profileName });
      sendTabsUpdate();
    });
    socket.on("profile:tabs", (data: ProfileTabs) => {
      profiles[data.profile] = data.windows;
    });
  } catch (error) {
    logError("ProfileConnector", "Failed to connect to MCP", { error });
  }
}

export async function getProfileName(): Promise<string> {
  return new Promise((resolve) => {
    if (chrome.identity && chrome.identity.getProfileUserInfo) {
      try {
        chrome.identity.getProfileUserInfo((info) => {
          resolve(info.email || info.id || "unknown");
        });
      } catch {
        resolve("unknown");
      }
    } else {
      resolve("unknown");
    }
  });
}

export async function sendTabsUpdate() {
  if (!socket || !socket.connected) return;
  const windows = await storageGet<Record<string, TabInfo[]>>(APPLICATION_TABS_KEY) || {};
  socket.emit("profile:tabs", { profile: profileName, windows } as ProfileTabs);
}

export function getProfiles(): Record<string, Record<string, TabInfo[]>> {
  return { ...profiles };
}
