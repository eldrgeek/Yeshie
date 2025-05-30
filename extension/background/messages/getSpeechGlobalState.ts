import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getSpeechGlobalState } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const state = await getSpeechGlobalState()
    logInfo("GetSpeechGlobalStateHandler", "Retrieved speech global state")
    res.send(state)
  } catch (error) {
    logError("GetSpeechGlobalStateHandler", "Error getting speech global state", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 