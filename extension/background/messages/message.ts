import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { message } = req.body
  
  console.log("Background script received message:", message);
  
  // Handle clipboard operation
  if (message === "set_clipboard") {
    console.log("Background script received set_clipboard message");
    try {
      // Use Chrome's extension clipboard API
      await chrome.clipboard.writeText("Start test 'learn claude'");
      console.log("Successfully wrote to clipboard");
      res.send({ success: true, message: "Clipboard updated successfully" });
      return;
    } catch (error) {
      console.error("Failed to write to clipboard:", error);
      res.send({ success: false, message: "Failed to update clipboard" });
      return;
    }
  }
  
  // Default response for other messages
  res.send({ success: false, message: "Unknown message type" });
}

export default handler 