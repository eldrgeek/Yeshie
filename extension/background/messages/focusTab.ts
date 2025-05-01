import type { PlasmoMessaging } from "@plasmohq/messaging"

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
    
    console.log("Focus request received for tab:", tabId)
    
    try {
      // First, verify the tab exists
      const tab = await chrome.tabs.get(tabId)
      console.log("Tab to focus:", tab)
      
      // First focus the window containing the tab
      if (tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true })
        console.log("Window focused:", tab.windowId)
      }
      
      // Then focus the tab itself
      await chrome.tabs.update(tabId, { active: true })
      console.log("Tab activated:", tabId)
      
      res.send({
        success: true,
        message: "Tab successfully focused"
      })
    } catch (tabError) {
      console.error("Error accessing tab:", tabError)
      // Tab might not exist anymore, handle gracefully
      res.send({
        success: false,
        error: "Tab not found or inaccessible",
        details: tabError.message
      })
    }
  } catch (error) {
    console.error("Error focusing tab:", error)
    res.send({
      success: false,
      error: error.message
    })
  }
}

export default handler 