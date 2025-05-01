import type { PlasmoMessaging } from "@plasmohq/messaging"
import { focusLastActiveTab, getLastActiveTab } from "../tabHistory"

/**
 * Message handler to focus the last active tab.
 * This helps users return to their previous tab after the extension tab opens.
 */
const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    // Get the latest info about the last active tab
    const lastTab = await getLastActiveTab()
    
    if (!lastTab) {
      console.warn("No last active tab found in focusLastTab handler")
      res.send({
        success: false,
        error: "No valid tab to focus"
      })
      return
    }
    
    console.log(`Attempting tab focus in focusLastTab handler:`, lastTab.id)
    
    // Make multiple focus attempts with the most reliable approach
    const makeAttempt = async (attemptNumber = 1) => {
      try {
        // Try to focus the window first
        const tab = await chrome.tabs.get(lastTab.id)
        
        if (tab.windowId) {
          console.log(`Attempt ${attemptNumber}: Focusing window ${tab.windowId}`)
          await chrome.windows.update(tab.windowId, { focused: true })
        }
        
        // Short delay to let window focus complete
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Then focus the tab itself
        console.log(`Attempt ${attemptNumber}: Focusing tab ${lastTab.id}`)
        await chrome.tabs.update(lastTab.id, { active: true })
        
        // Verify the tab is now active
        const activeTabs = await chrome.tabs.query({ active: true, windowId: tab.windowId })
        const isNowActive = activeTabs.some(t => t.id === lastTab.id)
        
        if (isNowActive) {
          console.log(`Attempt ${attemptNumber}: Tab successfully focused:`, lastTab.id)
          return true
        } else {
          console.warn(`Attempt ${attemptNumber}: Tab did not become active despite API call`, lastTab.id)
          return false
        }
      } catch (error) {
        console.error(`Attempt ${attemptNumber}: Error focusing tab:`, error)
        return false
      }
    }
    
    // Make up to 3 attempts with increasing delays
    let success = await makeAttempt(1)
    
    if (!success) {
      // Wait and try again
      await new Promise(resolve => setTimeout(resolve, 200))
      success = await makeAttempt(2)
      
      if (!success) {
        // One more try after a longer delay
        await new Promise(resolve => setTimeout(resolve, 500))
        success = await makeAttempt(3)
      }
    }
    
    if (success) {
      console.log("Successfully focused tab after attempts")
      res.send({
        success: true,
        message: "Tab focused successfully"
      })
      return
    }
    
    // If direct attempts failed, try the alternative method
    console.log("Direct focus attempts failed, trying focusLastActiveTab as fallback")
    const fallbackSuccess = await focusLastActiveTab()
    
    if (fallbackSuccess) {
      console.log("Successfully focused last active tab via focusLastActiveTab")
      res.send({
        success: true,
        message: "Tab focused successfully via fallback method"
      })
    } else {
      console.warn("Failed to focus last active tab with any method")
      res.send({
        success: false,
        error: "Failed to focus tab with any method"
      })
    }
  } catch (error) {
    console.error("Error in focusLastTab handler:", error)
    res.send({
      success: false,
      error: error.message || "Unknown error focusing tab"
    })
  }
}

export default handler 