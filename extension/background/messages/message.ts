import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { message } = req.body
  
  console.log("Background script received message:", message);
  
  // Default response for messages
  res.send({ success: false, message: "Unknown message type" });
}

export default handler 