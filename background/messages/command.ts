import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { command, sessionId } = req.body
  
  // TODO: Implement actual command execution logic
  res.send({
    success: true
  })
}

export default handler 