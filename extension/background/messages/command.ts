import type { PlasmoMessaging } from "@plasmohq/messaging"
import { logInfo, logError } from "../../functions/logger"
import { openOrFocusExtensionTab } from "../index"

export interface CommandRequest {
  command: unknown
  sessionId?: string
}

export interface CommandResponse {
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Execute a Stepper command payload and return the result.
 * Separated for easier unit testing.
 */
export async function executeCommand (
  command: unknown,
  sessionId?: string
): Promise<CommandResponse> {
  if (command === undefined || command === null) {
    const errorMsg = "No command provided"
    logError("BGCommand", errorMsg)
    return { success: false, error: errorMsg }
  }

  try {
    if (typeof command === 'string' && command.trim().toLowerCase() === 'start daily mode') {
      const tabId = await openOrFocusExtensionTab();
      if (tabId) {
        await chrome.tabs.sendMessage(tabId, { type: 'DAILY_RITUAL_START' });
        logInfo('BGCommand', 'Daily ritual start command handled', { tabId });
        return { success: true };
      }
      throw new Error('Control page not found');
    }

    const CONTROL_PAGE_URL = chrome.runtime.getURL("tabs/index.html")
    const CONTROL_PAGE_PATTERN = `${CONTROL_PAGE_URL}*`

    const [tab] = await chrome.tabs.query({ url: CONTROL_PAGE_PATTERN })

    if (!tab?.id) {
      throw new Error("Control page not found")
    }

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "RUN_STEPPER_STEP",
      step: command,
      sessionId
    })

    logInfo("BGCommand", "Command executed", { command, sessionId, result })
    return { success: true, result }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logError("BGCommand", "Command execution failed", { error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { command, sessionId } = req.body as CommandRequest

  const response = await executeCommand(command, sessionId)
  res.send(response)
}

export default handler
