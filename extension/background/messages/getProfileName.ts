import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getCurrentProfileName } from "../profileConnector"

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  try {
    const profile = getCurrentProfileName()
    res.send({ profile })
  } catch (error) {
    res.send({ profile: "unknown" })
  }
}

export default handler
