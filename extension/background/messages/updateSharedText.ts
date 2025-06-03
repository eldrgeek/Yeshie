import type { PlasmoMessaging } from "@plasmohq/messaging"
import { updateSharedText } from "../../functions/speechGlobalState"
import { logInfo, logError } from "../../functions/logger"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    const { text, updatingEditorId } = req.body
    await updateSharedText(text, updatingEditorId)
    logInfo("UpdateSharedTextHandler", "Updated shared text", { textLength: text?.length, updatingEditorId })
    res.send({ success: true })
  } catch (error) {
    logError("UpdateSharedTextHandler", "Error updating shared text", { error })
    res.send({ error: error instanceof Error ? error.message : "Unknown error" })
  }
}

export default handler 