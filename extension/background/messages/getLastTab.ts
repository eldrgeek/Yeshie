import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getLastActiveTab, type TabInfo } from "../tabHistory"
import type { GetLastTabResponse } from "../../tabs/index.tsx"

const DEBUG_TABS = false; // Control tab-related logging

/**
 * Message handler to retrieve information about the last active tab.
 * This is used to display the last tab in the extension UI and to allow
 * users to return to their previous tab.
 */
const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    // Always get a fresh query of the last active tab
    const lastTab: TabInfo | null = await getLastActiveTab()
    
    if (lastTab) {
      // Verify tab still exists and get most current info
      try {
        const currentTab = await chrome.tabs.get(lastTab.id)
        
        // Update with the most current information
        const updatedTab: TabInfo = {
          id: currentTab.id ?? lastTab.id,
          title: currentTab.title || lastTab.title,
          url: currentTab.url || lastTab.url,
          timestamp: Date.now()
        }
        
        // Don't log the full object unless debugging
        if (DEBUG_TABS) console.log("Retrieved last active tab (verified):", updatedTab)
        else console.log("Retrieved last active tab (verified): ID", updatedTab.id)

        res.send({
          success: true,
          lastTab: updatedTab
        } as GetLastTabResponse)
      } catch (tabError) {
        console.warn("Last tab no longer exists:", lastTab.id)
        res.send({
          success: false,
          error: "Last active tab no longer exists"
        } as GetLastTabResponse)
      }
    } else {
      if (DEBUG_TABS) console.log("No last active tab found")
      res.send({
        success: false,
        error: "No last active tab found"
      } as GetLastTabResponse)
    }
  } catch (error) {
    console.error("Error retrieving last active tab:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error getting last tab";
    res.send({
      success: false,
      error: errorMessage
    } as GetLastTabResponse)
  }
}

export default handler 