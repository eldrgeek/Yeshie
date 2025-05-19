import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Stepper } from "../../functions/Stepper"
import { logInfo, logError } from "../../functions/logger"

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
    const result = await Stepper(command as any)
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
