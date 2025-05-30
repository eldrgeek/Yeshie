import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getFocusedSpeechEditor } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const editor = await getFocusedSpeechEditor()
    logInfo("GetFocusedSpeechEditorHandler", "Retrieved focused speech editor")
    res.send(editor)
  } catch (error) {
    logError("GetFocusedSpeechEditorHandler", "Error getting focused speech editor", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 