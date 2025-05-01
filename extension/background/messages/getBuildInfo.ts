import type { PlasmoMessaging } from "@plasmohq/messaging"
import { getBuildInfo } from "../buildCounter"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  res.send(getBuildInfo())
}

export default handler 