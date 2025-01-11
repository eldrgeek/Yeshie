export interface ConversationEntry {
    from: "Y" | "U";
    text: string;
    actions?: string[];
    cursorActions?: {
      type: 'cursor-log' | 'cursor-command';
      payload: any;
    }[];
  }
  
  export const TEST_CONVERSATION: ConversationEntry[] = [
    {
      from: "Y",
      text: `# Welcome
  
  Hello! I'm Yeshie, your AI assistant. What's your name?`,
      actions: []
    },
    {
      from: "U",
      text: "Mike"
    },
    {
      from: "Y",
      text: `Hi Mike! What would you like to do?
    1. Help
    2. Demo
    3. Other`,
      actions: []
    },
    {
      from: "U",
      text: "2"
    },
    {
      from: "Y",
      text: `Which demo would you like?
    1. Add a user to github
    2. Add a user through YeshID
    3. Add a user through the Google Admin console
    4. Cursor Integration Demo`,
      actions: []
    },
    {
      from: "U",
      text: "4"
    },
    {
      from: "Y",
      text: `I'll demonstrate the Cursor integration features.
  
  Here's what we'll do:
  1. Send a test message to Cursor
  2. Open a file in Cursor
  3. Make some edits
  4. Show logs in Cursor
  
  Should I proceed with this demo?`,
      actions: [],
      cursorActions: [
        {
          type: 'cursor-log',
          payload: {
            message: 'Starting Cursor integration demo',
            important: true
          }
        }
      ]
    },
    {
      from: "U",
      text: "yes"
    },
    {
      from: "Y",
      text: `Great! I'll start by sending some test messages to Cursor.
  
  1. First, I'll send a regular log message
  2. Then, I'll send an important message that will show as a notification
  3. Finally, I'll demonstrate file operations
  
  Watch your Cursor window for the messages.`,
      actions: [],
      cursorActions: [
        {
          type: 'cursor-log',
          payload: {
            message: 'This is a regular log message from Yeshie',
            important: false
          }
        },
        {
          type: 'cursor-log',
          payload: {
            message: 'This is an important notification from Yeshie!',
            important: true
          }
        }
      ]
    }
  ]; 