import type { PlasmoMessaging } from "@plasmohq/messaging"
import { logInfo, logError } from "../../functions/logger";

declare namespace chrome {
  namespace tabs {
    function query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<{ id?: number }[]>
  }
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id ?? -1;
    logInfo("GetTabIdHandler", "Selected tab ID", { tabId });
    res.send({
      tabId
    });
  } catch (error) {
    logError("GetTabIdHandler", "Error getting current tab ID", { error });
    res.send({
      tabId: -1
    });
  }
}

export default handler 