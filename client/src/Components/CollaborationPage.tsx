import React, { useEffect, useRef, useState, useCallback } from "react";
import { Box, VStack, Heading, useToast } from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, EditorSelection, StateEffect, Prec } from "@codemirror/state";
import { defaultKeymap, indentWithTab, history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { ModeManager, EditorMode, MessageHandler, TestManager } from "@yeshie/shared";
import { ChakraNotificationAdapter } from "../adapters/NotificationAdapter";
import { SessionStorageAdapter } from "../adapters/StorageAdapter";
import { SocketMessageSender } from "../adapters/MessageSender";
import { createBackgroundField } from "../editor/config";
import { logInfo, logWarn, logError } from "@yeshie/shared/utils/logger";
import { TEST_CONVERSATION } from './TestConversation';
import { 
  processCommand, 
  CommandResult, 
  executeTerminalCommand,
  executeWorkflow,
  updateEnvFile,
  parseFirebaseConfig,
  parseNetlifyToken,
  parseVercelToken,
  saveConfigToEnv
} from '../services/commandHandler';

interface CollaborationPageProps {
  socket: Socket | null;
  sessionID: string;
}

// Function to format conversation entry
const formatEntry = (entry: typeof TEST_CONVERSATION[0], isFirst: boolean = false) => {
  // Use blockquote for user messages and regular text for Yeshie
  const formattedText = entry.from === "U" 
    ? `> ${entry.text.split('\n').join('\n> ')}` // Prefix each line with > for user messages
    : entry.text;
  return (isFirst ? "" : "\n") + formattedText + "\n\n";
};

const DEFAULT_CONTENT = `# Welcome to Yeshie
Type 'test' for an interactive demo or 'testall' to see a complete conversation.

`;  // Note the extra newline at the end

const CollaborationPage: React.FC<CollaborationPageProps> = ({
  socket,
  sessionID,
}) => {
  const [currentTestStep, setCurrentTestStep] = useState<number>(0);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const handleEnterKeyRef = useRef<(view: EditorView) => boolean>();
  const toast = useToast();
  const isIframe = window.self !== window.top;
  
  // Set initial mode to 'pro'
  const [mode, setMode] = useState<EditorMode>("pro");

  // Initialize mode manager with 'pro' as default mode
  const modeManagerRef = useRef<ModeManager>(
    new ModeManager(
      new SessionStorageAdapter(),
      new ChakraNotificationAdapter(toast),
      "pro" // Set default mode to 'pro'
    )
  );

  const messageHandlerRef = useRef<MessageHandler>(
    new MessageHandler(
      modeManagerRef.current,
      new SocketMessageSender(socket),
      new ChakraNotificationAdapter(toast)
    )
  );

  const testManagerRef = useRef<TestManager>(
    new TestManager(TEST_CONVERSATION)
  );
  
  // Add effect to sync mode with ModeManager
  useEffect(() => {
    const modeManager = modeManagerRef.current;
    // Set initial mode
    setMode(modeManager.getMode());
    
    // Subscribe to mode changes
    const unsubscribe = modeManager.onModeChange(setMode);
    return unsubscribe;
  }, []); // Empty deps since we only want to run this once on mount

  const filterString = (inputString: string): string => {
    const pattern = /\/\*\*[\s\S]*?\*\*\//g;
    return inputString.replace(pattern, '');
  };

  const sendPostMessage = useCallback((content: string) => {
    if (mode === "llm") {
      logError("Attempted to send postMessage in LLM mode");
      return;
    }

    content = filterString(content);
    const lines = content.split("\n").filter(line => line.trim());

    const sendLine = (index: number) => {
      if (index >= lines.length) return;

      const line = lines[index].trim();
      if (!line.startsWith("//")) {
        if (line.startsWith('message ')) {
          toast({
            title: "Message",
            description: line.substring(8),
            status: "info",
            duration: 2000,
            isClosable: true,
          });
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            { type: "monitor", op: "command", from: sessionID, line },
            "*"
          );

          toast({
            title: "PostMessage",
            description: line,
            status: "info",
            duration: 2000,
            isClosable: true,
          });
        }
      }
      setTimeout(() => sendLine(index + 1), 1000);
    };

    sendLine(0);
  }, [mode, sessionID, toast]);

  // Add socket connection state
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Add socket connection monitoring
  useEffect(() => {
    if (!socket) {
      logInfo('No socket provided to CollaborationPage');
      return;
    }

    const handleConnect = () => {
      logInfo('Socket connected in CollaborationPage');
      setIsSocketConnected(true);
    };

    const handleDisconnect = () => {
      logInfo('Socket disconnected in CollaborationPage');
      setIsSocketConnected(false);
    };

    const handleConnectError = (error: Error) => {
      logError('Socket connection error in CollaborationPage:', error);
      setIsSocketConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    
    // Set initial connection state
    logInfo('Initial socket state:', {
      connected: socket.connected,
      id: socket.id
    });
    setIsSocketConnected(socket.connected);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket]);

  const viewRef = useRef<EditorView | null>(null);

  const updateContent = useCallback((newContent: string, mode: "append" | "replace" = "replace") => {
    logInfo(`[updateContent] called with mode: ${mode}`);
    if (!viewRef.current) return;
    const view = viewRef.current;

    if (mode === "append") {
      const currentContent = view.state.doc.toString();
      // Remove trailing newlines from current content
      const trimmedCurrent = currentContent.replace(/\n+$/, "");
      // Add newlines between existing and new content if needed
      const separator = trimmedCurrent ? "\n\n" : "";
      const fullContent = trimmedCurrent + separator + newContent;

      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: fullContent
        },
        selection: EditorSelection.cursor(fullContent.length)
      });
    } else {
      // Replace mode - just replace everything
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: newContent
        },
        selection: EditorSelection.cursor(newContent.length)
      });
    }
  }, [viewRef]);

  // Declare clearEditor before use
  const clearEditor = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" }
      });
    }
  }, []);

  // Declare displayNextEntry before use
  const displayNextEntry = useCallback(() => {
    if (viewRef.current) {
      const entry = TEST_CONVERSATION[currentTestStep];
      updateContent(formatEntry(entry, true), "replace");
      setCurrentTestStep(prev => prev + 1);
    }
  }, [currentTestStep]);

  // Declare addBlankLine before use
  const addBlankLine = useCallback(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        changes: { from: viewRef.current.state.doc.length, insert: "\n" },
        selection: { anchor: viewRef.current.state.doc.length + 1 }
      });
      viewRef.current.dispatch({
        effects: StateEffect.appendConfig.of([])
      });
    }
  }, []);

  // Modify startTest to reset state
  const startTest = useCallback(() => {
    setIsTestMode(true);
    setCurrentTestStep(0);
    clearEditor();
    displayNextEntry();
  }, [clearEditor, displayNextEntry]);

  // Update handleEnterKey to handle Enter key presses correctly
  const handleEnterKey = useCallback((view: EditorView) => {
    const content = view.state.doc.toString();
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    logInfo(`[handleEnterKey] called with lastLine: ${lastLine}`, { isTestMode, currentTestStep });
    
    // Handle test/testall commands
    if (lastLine === "test") {
      logInfo("Starting test mode");
      startTest();
      return true;
    } else if (lastLine === "testall") {
      setIsTestMode(false);
      logInfo("Calling startTestAll");
      testManagerRef.current.startTestAll(updateContent, isIframe, sendPostMessage);
      return true;
    }
    
    // Handle test mode conversation
    if (testManagerRef.current.handleTestMode(lastLine, addBlankLine, updateContent, isIframe, sendPostMessage)) {
      return true;
    }
    
    // Default behavior: add a single newline
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: "\n" },
      selection: { anchor: pos + 1 }
    });
    return true;
  }, [isIframe, sendPostMessage, setIsTestMode, clearEditor, displayNextEntry, updateContent, addBlankLine, startTest]);

  // Update the ref whenever relevant state changes
  useEffect(() => {
    handleEnterKeyRef.current = handleEnterKey;
  }, [isTestMode, currentTestStep, mode, isIframe, handleEnterKey]);

  // Wrap sendContent in useCallback
  const sendContent = useCallback(() => {
    const content = viewRef.current?.state.doc.toString() || "";
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    
    logInfo("[sendContent] called:", {
      mode,
      content,
      lastLine,
      isIframe,
      socketConnected: isSocketConnected,
      socketExists: !!socket
    });

    // Save content to sessionStorage
    sessionStorage.setItem("editorContent", content);

    // Check for special commands first
    if (lastLine === "test" || lastLine === "testall") {
      if (viewRef.current && handleEnterKeyRef.current) {
        handleEnterKeyRef.current(viewRef.current);
      }
      return;
    }

    // Use the shared MessageHandler for mode changes and message sending
    messageHandlerRef.current.sendMessage(content, sessionID, isIframe);
  }, [mode, isIframe, socket, isSocketConnected, sessionID]);

  // Add key handlers with useCallback
  const handleSave = useCallback(() => {
    logInfo("[handleSave] called");
    sendContent();
    return true;
  }, [sendContent]);

  const handleEnter = useCallback(() => {
    logInfo("[handleEnter] called");
    sendContent();
    return true;
  }, [sendContent]);

  const handleSelectAll = useCallback((view: EditorView) => {
    try {
      const docLength = view.state.doc.length;
      if (docLength > 0) {
        view.dispatch(view.state.update({
          selection: EditorSelection.single(0, docLength)
        }));
      }
    } catch (e) {
      logError("Error in select all:", e);
    }
    return true;
  }, []);

  // Initialize editor only once
  const initializeEditor = useCallback(() => {
    if (!editorRef.current) return;

    try {
      const startState = EditorState.create({
        doc: DEFAULT_CONTENT,
        extensions: [
          Prec.highest(
            keymap.of([
              {
                key: "Mod-s",
                preventDefault: true,
                run: handleSave,
              },
              {
                key: "Meta-Enter",
                preventDefault: true,
                run: handleEnter,
              },
              {
                key: "Ctrl-Enter",
                preventDefault: true,
                run: handleEnter,
              },
              {
                key: "Mod-a",
                preventDefault: true,
                run: handleSelectAll,
              },
              {
                key: "Enter",
                run: (view: EditorView) => {
                  const content = view.state.doc.toString();
                  const lines = content.split('\n');
                  const lastLine = lines[lines.length - 1].trim();
                  
                  // For mode changes, let sendContent handle it
                  if (lastLine === "command" || lastLine === "llm") {
                    handleEnter();
                    return true;
                  }
                  
                  return handleEnterKeyRef.current?.(view) ?? false;
                }
              }
            ])
          ),
          keymap.of([...defaultKeymap, indentWithTab]),
          markdown(),
          EditorView.lineWrapping,
          history(),
          createBackgroundField()
        ],
      });

      if (viewRef.current) {
        viewRef.current.destroy();
      }

      viewRef.current = new EditorView({
        state: startState,
        parent: editorRef.current
      });
    } catch (error) {
      logError('Error initializing editor:', error);
    }
  }, [handleSave, handleEnter, handleSelectAll]);

  // Initialize editor on mount
  useEffect(() => {
    initializeEditor();
    return () => {
      viewRef.current?.destroy();
    };
  }, [initializeEditor]);

  // Function to send commands to the extension (command mode)
  function commandModeSendLine(line: string) {
    window.parent.postMessage({ type: "monitor", op: "command", line }, "*");
  }

  // Function to send user input to ChatGPT via command mode
  function handleProSubmit(userText: string) {
    logInfo("Submitting to ChatGPT:", userText);

    // Process special commands first
    const commandResult = processCommand(userText);
    if (commandResult) {
      handleCommandResult(commandResult);
      return;
    }

    // 1) Type the text into ChatGPT
    commandModeSendLine(`type #prompt-textarea "${escapeForCommand(userText)}"`);

    // 2) Click the send button
    commandModeSendLine(`click [data-testid="send-button"]`);
  }

  // New function to handle command results
  function handleCommandResult(result: CommandResult) {
    logInfo("Command result:", result);
    
    if (!result.success) {
      // Show error notification
      if (socket) {
        socket.emit("notification", { type: "error", message: result.message });
      }
      return;
    }
    
    switch (result.type) {
      case 'deployment':
        // Display the command to be executed
        if (socket) {
          socket.emit("message", { from: 'Y', text: `${result.message}\n\`\`\`\n${result.command}\n\`\`\`` });
        }
        
        // Optionally, execute the command directly
        if (window.confirm(`Do you want to execute the deployment command for ${result.provider}?`)) {
          executeTerminalCommand(result.command);
        }
        break;
        
      case 'project-creation':
        // Display the command to create a new project
        if (socket) {
          socket.emit("message", { 
            from: 'Y', 
            text: `${result.message}\n\`\`\`\n${result.command}\n\`\`\`\n\nAfter creating the project, you can generate configuration keys with: \`generate ${result.provider} keys project:<PROJECT_ID>\``
          });
        }
        
        // Optionally, execute the command directly
        if (window.confirm(`Do you want to create a new ${result.provider} project?`)) {
          executeTerminalCommand(result.command);
        }
        break;
        
      case 'key-generation':
        // Display the command to generate keys
        if (socket) {
          socket.emit("message", { 
            from: 'Y', 
            text: `${result.message}\n\`\`\`\n${result.command}\n\`\`\`\n\nAfter generating the configuration, use \`save ${result.provider} config <CONFIG_JSON>\` to save it.`
          });
        }
        
        // Optionally, execute the command directly
        if (window.confirm(`Do you want to generate ${result.provider} configuration?`)) {
          executeTerminalCommand(result.command);
        }
        break;
        
      case 'workflow':
        // Handle automated workflow
        if (socket) {
          socket.emit("message", { from: 'Y', text: `${result.message}` });
          socket.emit("message", { from: 'Y', text: `Starting workflow with automatic .env file updates enabled...` });
        }
        
        // Execute the workflow with progress updates
        if (window.confirm(`Do you want to start the automated ${result.workflow.type} workflow?`)) {
          executeWorkflowWithProgress(result.workflow, true);
        }
        break;
        
      case 'schema':
        // Display the generated schema information
        if (socket) {
          socket.emit("message", { 
            from: 'Y', 
            text: `${result.message}\n\n**TypeScript Interface:**\n\`\`\`typescript\n${result.tsInterface}\n\`\`\`\n\n**Firestore Rules:**\n\`\`\`\n${result.firestoreRules}\n\`\`\`` 
          });
        }
        break;
        
      case 'save-config':
        // Process the configuration text based on provider
        let parsedConfig = null;
        
        if (result.provider === 'firebase') {
          parsedConfig = parseFirebaseConfig(result.configText);
        } else if (result.provider === 'netlify') {
          parsedConfig = parseNetlifyToken(result.configText);
        } else if (result.provider === 'vercel') {
          parsedConfig = parseVercelToken(result.configText);
        }
        
        if (parsedConfig) {
          const configResult = saveConfigToEnv(parsedConfig);
          
          if (socket) {
            socket.emit("message", { 
              from: 'Y', 
              text: `${configResult.message}`
            });
          }
        } else {
          // Could not parse the configuration
          if (socket) {
            socket.emit("message", { 
              from: 'Y', 
              text: `Could not parse ${result.provider} configuration. Please check the format and try again.` 
            });
          }
        }
        break;
        
      case 'update-env':
        // Directly update the .env file
        updateEnvFile(result.configText)
          .then(() => {
            if (socket) {
              socket.emit("message", { 
                from: 'Y', 
                text: `✅ Successfully updated .env file with the configuration.` 
              });
            }
          })
          .catch(error => {
            if (socket) {
              socket.emit("message", { 
                from: 'Y', 
                text: `❌ Failed to update .env file: ${error instanceof Error ? error.message : 'Unknown error'}` 
              });
            }
          });
        break;
        
      case 'config-saved':
        // Config already saved, display confirmation
        if (socket) {
          socket.emit("message", { 
            from: 'Y', 
            text: `${result.message}` 
          });
        }
        break;
        
      case 'upload-schema-request':
      case 'upload-file-request':
        // Display the request for schema definition or file
        if (socket) {
          socket.emit("message", { from: 'Y', text: result.message });
        }
        break;
        
      case 'schema-uploaded':
      case 'file-uploaded':
        // Display success message
        if (socket) {
          socket.emit("message", { from: 'Y', text: result.message });
        }
        break;
    }
  }

  // Helper function to execute a workflow with progress updates
  async function executeWorkflowWithProgress(workflow: any, autoUpdateEnv = true) {
    try {
      // Execute the workflow with progress feedback
      await executeWorkflow(
        workflow, 
        (step, total, description) => {
          // Send progress update messages
          if (socket) {
            const progressPercent = Math.round((step / total) * 100);
            socket.emit("message", { 
              from: 'Y', 
              text: `🔄 **Workflow Step ${step}/${total}:** ${description} (${progressPercent}%)` 
            });
          }
        },
        autoUpdateEnv
      ).then(result => {
        // When workflow completes, show the final result
        if (socket) {
          socket.emit("message", { 
            from: 'Y', 
            text: `✅ **Workflow Completed**\n\n${result}` 
          });
        }
      }).catch(error => {
        // If workflow fails, show the error
        if (socket) {
          socket.emit("message", { 
            from: 'Y', 
            text: `❌ **Workflow Failed**\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
        }
      });
    } catch (error) {
      logError('Error executing workflow:', error);
      if (socket) {
        socket.emit("notification", { 
          type: "error", 
          message: `Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    }
  }

  // Prevent command injections
  function escapeForCommand(s: string): string {
    return s.replace(/"/g, '\\"'); // Escape quotes for command mode
  }

  // Main function to handle editor submission
  const handleEditorSubmit = useCallback(() => {
    const content = viewRef.current?.state.doc.toString() || ""; // Retrieve actual editor text

    if (mode === "pro") {
      handleProSubmit(content);
    } else {
      logInfo(`Other mode: ${mode}`);
    }
  }, [mode]);

  const styles = `
    .cm-yeshie-response {
      background-color: rgba(230, 255, 230, 0.5);  /* Light green with transparency */
      display: block;
      width: 100%;
      padding: 2px 4px;
      box-sizing: border-box;
    }
    
    .cm-user-response {
      background-color: rgba(230, 243, 255, 0.5);  /* Light blue with transparency */
      display: block;
      width: 100%;
      padding: 2px 4px;
      box-sizing: border-box;
    }

    .cm-line {
      position: relative;
    }

    /* Let CodeMirror's default selection styling show through */
    .cm-selectionBackground {
      background-color: #1a73e8 !important;
      opacity: 0.3;
    }
  `;

  return (
    <>
      <style>{styles}</style>
      <Box p={0} width="100hw" height="100vh" display="flex" flexDirection="column">
        <VStack width="100hw" spacing={2} align="stretch" flex="1" overflow="hidden">
          <Heading as="h2" size="lg">
            Collaboration Page - {mode.toUpperCase()} Mode
          </Heading>
          <h3>
            {isIframe ? " (Iframe)" : "Native"}
          </h3>
          <select value={mode} onChange={(e) => setMode(e.target.value as EditorMode)}>
            <option value="llm">LLM</option>
            <option value="command">Command</option>
            <option value="pro">Pro</option>
          </select>
          <Box
            ref={editorRef}
            flex="1"
            border="1px solid"
            borderColor="gray.200"
            width="100%"
            overflow="auto"
            padding="2px"
          />
          <button onClick={handleEditorSubmit}>Submit</button>
        </VStack>
      </Box>
    </>
  );
};

export default CollaborationPage;