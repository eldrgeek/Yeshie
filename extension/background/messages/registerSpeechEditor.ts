import type { PlasmoMessaging } from "@plasmohq/messaging"
import { registerSpeechEditor } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const { editorId, tabId } = req.body
    await registerSpeechEditor(editorId, tabId)
    logInfo("RegisterSpeechEditorHandler", "Registered speech editor", { editorId, tabId })
    res.send({ success: true })
  } catch (error) {
    logError("RegisterSpeechEditorHandler", "Error registering speech editor", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 