import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { message, command, diagnosticData } = req.body
  
  console.log("Background script received message:", message || command);
  
  // Handle diagnostic commands
  if (command === "saveDiagnosticLog") {
    try {
      // Store the diagnostic data in persistent storage
      if (diagnosticData) {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const key = `diagnosticLog_${timestamp}`;
        
        // Use chrome.storage.local to save the diagnostic data
        chrome.storage.local.set({ 
          [key]: {
            timestamp,
            data: diagnosticData,
            userAgent: navigator.userAgent,
            url: req.body.url || "unknown"
          }
        }, () => {
          console.log(`Diagnostic log saved with key: ${key}`);
          res.send({ 
            success: true, 
            message: "Diagnostic log saved",
            key
          });
        });
      } else {
        res.send({ 
          success: false, 
          message: "No diagnostic data provided" 
        });
      }
      return;
    } catch (error) {
      console.error("Error saving diagnostic log:", error);
      res.send({ 
        success: false, 
        message: `Error saving diagnostic log: ${error.message}` 
      });
      return;
    }
  }
  
  // Handle retrieving diagnostic logs
  if (command === "getDiagnosticLogs") {
    try {
      chrome.storage.local.get(null, (items) => {
        // Filter for only diagnostic logs
        const logs = Object.entries(items)
          .filter(([key]) => key.startsWith('diagnosticLog_'))
          .map(([key, value]) => ({ key, ...value }));
        
        res.send({ 
          success: true, 
          logs
        });
      });
      return;
    } catch (error) {
      console.error("Error retrieving diagnostic logs:", error);
      res.send({ 
        success: false, 
        message: `Error retrieving diagnostic logs: ${error.message}` 
      });
      return;
    }
  }
  
  // Default response for messages
  res.send({ success: false, message: "Unknown message type" });
}

export default handler 