/**
 * Utility functions for tab management and focus
 * These provide multiple methods to try to focus back to the original tab
 */

import { sendToBackground } from "@plasmohq/messaging"
import { logInfo, logWarn, logError } from "./logger";

/**
 * Store the current tab ID for future reference
 */
export let storedTabId: number | null = null

/**
 * Remember the current tab ID
 */
export const rememberCurrentTab = async (): Promise<number | null> => {
  try {
    const response = await sendToBackground({ name: "getTabId" })
    if (response && typeof response.tabId === 'number' && response.tabId > 0) {
      storedTabId = response.tabId
      logInfo("TabFocus", "Remembered tab ID", { tabId: storedTabId });
      return storedTabId
    }
  } catch (error) {
    logError("TabFocus", "Failed to remember tab", { error });
  }
  return null
}

/**
 * Focus back to a specific tab
 * This tries multiple approaches to maximize chances of success
 */
export const focusTab = async (tabId: number): Promise<boolean> => {
  logInfo("TabFocus", "Attempting to focus tab", { tabId });
  
  try {
    // Method 1: Using background script
    const response = await sendToBackground<{ tabId: number }, { success: boolean }>({ 
      name: "focusTab", 
      body: { tabId } 
    })
    
    logInfo("TabFocus", "Background focus response", { response });
    
    // Method 2: Try window.focus if possible
    if (window.opener) {
      logInfo("TabFocus", "Trying window.opener.focus()");
      window.opener.focus()
    }
    
    return response?.success || false
  } catch (error) {
    logError("TabFocus", "Error focusing tab", { error });
    return false
  }
}

/**
 * Focus back to the stored original tab
 */
export const focusStoredTab = async (): Promise<boolean> => {
  if (!storedTabId) {
    logWarn("TabFocus", "No stored tab ID to focus");
    return false
  }
  
  return await focusTab(storedTabId)
}

/**
 * Try multiple focus attempts with different delays
 */
export const attemptTabFocusWithRetries = (tabId: number, maxAttempts = 4): void => {
  // Try multiple times with increasing delays
  for (let i = 0; i < maxAttempts; i++) {
    const delay = 200 * Math.pow(2, i) // 200ms, 400ms, 800ms, 1600ms
    setTimeout(() => {
      logInfo("TabFocus", "Focus attempt", { attempt: i + 1, maxAttempts, delayMs: delay });
      focusTab(tabId)
    }, delay)
  }
} 