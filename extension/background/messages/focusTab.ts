import type { PlasmoMessaging } from "@plasmohq/messaging"
import { logInfo, logError } from "../../functions/logger";

declare namespace chrome {
  namespace tabs {
    function update(tabId: number, updateProperties: { active: boolean }): Promise<any>
    function get(tabId: number): Promise<chrome.tabs.Tab>
  }
  
  namespace windows {
    function update(windowId: number, updateInfo: { focused: boolean }): Promise<any>
  }
  
  namespace tabs {
    interface Tab {
      id: number
      windowId: number
      active: boolean
      url: string
      title: string
    }
  }
}

interface FocusTabRequest {
  tabId: number
}

/**
 * Handler to focus a specific tab
 * This is used to return focus to the original tab after extension loads
 */
const handler: PlasmoMessaging.MessageHandler<FocusTabRequest> = async (req, res) => {
  try {
    const { tabId } = req.body
    
    if (typeof tabId !== 'number' || tabId < 0) {
      throw new Error("Invalid tab ID")
    }
    
    logInfo("FocusTabHandler", "Focus request received", { tabId });
    
    try {
      // First, verify the tab exists
      const tab = await chrome.tabs.get(tabId)
      logInfo("FocusTabHandler", "Tab to focus", { tab });
      
      // First focus the window containing the tab
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true })
        logInfo("FocusTabHandler", "Window focused", { windowId: tab.windowId });
      }
      
      // Then focus the tab itself
      await chrome.tabs.update(tabId, { active: true })
      logInfo("FocusTabHandler", "Tab activated", { tabId });
      
      res.send({
        success: true,
        message: "Tab successfully focused"
      })
    } catch (tabError) {
      logError("FocusTabHandler", "Error accessing tab", { error: tabError });
      // Tab might not exist anymore, handle gracefully
      res.send({
        success: false,
        error: "Tab not found or inaccessible",
        details: tabError.message
      })
    }
  } catch (error) {
    logError("FocusTabHandler", "Error focusing tab", { error });
    res.send({
      success: false,
      error: error.message
    })
  }
}

export default handler 