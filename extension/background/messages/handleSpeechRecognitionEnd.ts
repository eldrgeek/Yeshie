import type { PlasmoMessaging } from "@plasmohq/messaging"
import { handleSpeechRecognitionEnd } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const { editorId, result } = req.body
    await handleSpeechRecognitionEnd(editorId, result)
    logInfo("HandleSpeechRecognitionEndHandler", "Handled speech recognition end", { editorId })
    res.send({ success: true })
  } catch (error) {
    logError("HandleSpeechRecognitionEndHandler", "Error handling speech recognition end", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 