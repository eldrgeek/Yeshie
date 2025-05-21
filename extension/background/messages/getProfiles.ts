import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getProfiles } from "../profileConnector"

const handler: PlasmoMessaging.MessageHandler = async (_req, res) => {
  try {
    const profiles = getProfiles()
    res.send({ profiles })
  } catch (error) {
    res.send({ profiles: {} })
  }
}

export default handler
