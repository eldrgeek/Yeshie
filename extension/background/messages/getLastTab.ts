import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getLastActiveTab } from "../tabHistory"

/**
 * Message handler to retrieve information about the last active tab.
 * This is used to display the last tab in the extension UI and to allow
 * users to return to their previous tab.
 */
const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    // Always get a fresh query of the last active tab
    const lastTab = await getLastActiveTab()
    
    if (lastTab) {
      // Verify tab still exists and get most current info
      try {
        const currentTab = await chrome.tabs.get(lastTab.id)
        
        // Update with the most current information
        const updatedTab = {
          ...lastTab,
          title: currentTab.title || lastTab.title,
          url: currentTab.url || lastTab.url
        }
        
        console.log("Retrieved last active tab (verified):", updatedTab)
        res.send({
          success: true,
          lastTab: updatedTab
        })
      } catch (tabError) {
        console.warn("Last tab no longer exists:", lastTab.id)
        res.send({
          success: false,
          error: "Last active tab no longer exists"
        })
      }
    } else {
      console.log("No last active tab found")
      res.send({
        success: false,
        error: "No last active tab found"
      })
    }
  } catch (error) {
    console.error("Error retrieving last active tab:", error)
    res.send({
      success: false,
      error: error.message
    })
  }
}

export default handler 