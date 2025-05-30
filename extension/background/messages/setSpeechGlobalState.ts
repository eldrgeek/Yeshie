import type { PlasmoMessaging } from "@plasmohq/messaging"
import { setSpeechGlobalState } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    await setSpeechGlobalState(req.body)
    logInfo("SetSpeechGlobalStateHandler", "Updated speech global state")
    res.send({ success: true })
  } catch (error) {
    logError("SetSpeechGlobalStateHandler", "Error setting speech global state", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 