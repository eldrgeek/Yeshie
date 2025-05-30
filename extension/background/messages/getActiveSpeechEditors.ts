import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getActiveSpeechEditors } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const editors = await getActiveSpeechEditors()
    logInfo("GetActiveSpeechEditorsHandler", "Retrieved active speech editors")
    res.send(editors)
  } catch (error) {
    logError("GetActiveSpeechEditorsHandler", "Error getting active speech editors", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 