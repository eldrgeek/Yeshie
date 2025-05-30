import type { PlasmoMessaging } from "@plasmohq/messaging"
import { unregisterSpeechEditor } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const { editorId } = req.body
    await unregisterSpeechEditor(editorId)
    logInfo("UnregisterSpeechEditorHandler", "Unregistered speech editor", { editorId })
    res.send({ success: true })
  } catch (error) {
    logError("UnregisterSpeechEditorHandler", "Error unregistering speech editor", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 