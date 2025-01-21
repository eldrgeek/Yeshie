import type { PlasmoMessaging } from "@plasmohq/messaging"

declare namespace chrome {
  namespace tabs {
    function query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<{ id?: number }[]>
  }
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id ?? -1;
    console.log("Selected tab ID:", tabId);
    res.send({
      tabId
    });
  } catch (error) {
    console.error("Error getting current tab ID:", error);
    res.send({
      tabId: -1
    });
  }
}

export default handler 