import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { message, sessionId, conversation } = req.body
  
  // TODO: Implement actual message handling logic
  res.send({
    message: "Response from background handler",
    commands: ["test command 1", "test command 2"]
  })
}

export default handler 