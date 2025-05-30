import type { PlasmoMessaging } from "@plasmohq/messaging"
import { setSpeechEditorFocus } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const { editorId, focused } = req.body
    await setSpeechEditorFocus(editorId, focused)
    logInfo("SetSpeechEditorFocusHandler", "Updated speech editor focus", { editorId, focused })
    res.send({ success: true })
  } catch (error) {
    logError("SetSpeechEditorFocusHandler", "Error setting speech editor focus", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 