import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  try {
    // Use the working global getLogsAndClear function instead of reimplementing
    const globalThis = (global as any);
    if (globalThis.getLogsAndClear) {
      const result = await globalThis.getLogsAndClear();
      res.send({
        logs: result.logs || [],
        success: true,
        clipboardSuccess: result.clipboardSuccess || false,
        clipboardText: result.clipboardText || ""
      });
    } else {
      res.send({
        logs: [],
        success: false,
        error: "getLogsAndClear function not available"
      });
    }
  } catch (error) {
    res.send({
      logs: [],
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export default handler 