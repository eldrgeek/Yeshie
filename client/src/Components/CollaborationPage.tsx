import React, { useEffect, useRef, useState, useCallback } from "react";
import { Box, VStack, Heading, useToast, UseToastOptions } from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Prec, RangeSet, EditorSelection, StateEffect, StateField, Range, Transaction } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab, history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Decoration, DecorationSet } from "@codemirror/view";
import { TEST_CONVERSATION } from './TestConversation';

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

const yeshieBackground = Decoration.mark({
  class: "cm-yeshie-response",
  inclusive: true
});

const userBackground = Decoration.mark({
  class: "cm-user-response",
  inclusive: true
});

const backgroundField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(_, tr: Transaction) {
    return RangeSet.of(getBackgroundRanges(tr.state.doc.toString()));
  },
  provide: f => EditorView.decorations.from(f)
});

function getBackgroundRanges(content: string): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  let currentPos = 0;
  
  const lines = content.split('\n');
  const lastLineIndex = lines.length - 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = currentPos;
    const lineLength = lines[i].length;
    
    if (line.trim() || i === lastLineIndex) {  // Check if it's the last line
      // In testall mode, look for the '>' prefix, or style last line if it's being typed on
      const isUserResponse = line.startsWith('> ') || (i === lastLineIndex && line.trim());
      ranges.push({
        from: lineStart,
        to: lineStart + lineLength,
        value: isUserResponse ? userBackground : yeshieBackground
      });
    }
    
    currentPos += lineLength + 1;
  }
  
  return ranges;
}

// Function to update editor content
const updateContent = (view: EditorView, newContent: string, mode: "append" | "replace" = "replace") => {
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
};

const CollaborationPage: React.FC<CollaborationPageProps> = ({
  socket,
  sessionID,
}) => {
  const [currentTestStep, setCurrentTestStep] = useState<number>(0);
  const [isTestMode, setIsTestMode] = useState<boolean>(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const handleEnterKeyRef = useRef<(view: EditorView) => boolean>();
  const innerToast = useToast();
  const toast = (opts: UseToastOptions) => {
    innerToast(opts);
  };
  
  const isIframe = window.self !== window.top;
  const [mode, setMode] = useState(() => {
    const savedMode = sessionStorage.getItem("editorMode");
    return (savedMode as "default" | "command" | "llm") || "llm";
  });

  const filterString = (inputString: string): string => {
    const pattern = /\/\*\*[\s\S]*?\*\*\//g;
    return inputString.replace(pattern, '');
  };

  const sendPostMessage = (content: string) => {
    if (mode === "llm") {
      console.error("Attempted to send postMessage in LLM mode");
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
  };

  // Add socket connection state
  const [isSocketConnected, setIsSocketConnected] = useState(false);

  // Add socket connection monitoring
  useEffect(() => {
    if (!socket) {
      console.log('No socket provided to CollaborationPage');
      return;
    }

    const handleConnect = () => {
      console.log('Socket connected in CollaborationPage');
      setIsSocketConnected(true);
    };

    const handleDisconnect = () => {
      console.log('Socket disconnected in CollaborationPage');
      setIsSocketConnected(false);
    };

    const handleConnectError = (error: Error) => {
      console.error('Socket connection error in CollaborationPage:', error);
      setIsSocketConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    
    // Set initial connection state
    console.log('Initial socket state:', {
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

  // Add these toast helper functions near the top of the component
  const showModeChangeToast = (newMode: "command" | "llm") => {
    toast({
      title: `Switched to ${newMode.toUpperCase()} mode`,
      status: "info",
      duration: 2000,
      isClosable: true,
    });
  };

  const showSocketErrorToast = () => {
    toast({
      title: "Error",
      description: "Socket not connected. Cannot send message in LLM mode.",
      status: "error",
      duration: 3000,
      isClosable: true,
    });
  };

  const showLLMSentToast = () => {
    toast({
      title: "Command sent to LLM via socket",
      status: "info",
      duration: 2000,
      isClosable: true,
    });
  };

  const showIframeErrorToast = () => {
    toast({
      title: "Error",
      description: "Command mode only works in iframe context",
      status: "error",
      duration: 3000,
      isClosable: true,
    });
  };

  const showInvalidModeToast = (mode: string) => {
    toast({
      title: "Error",
      description: `Invalid mode (${mode})`,
      status: "error",
      duration: 3000,
      isClosable: true,
    });
  };

  // Add mode change helper
  const changeMode = useCallback((newMode: "command" | "llm") => {
    console.log(`Switching to ${newMode} mode`);
    setMode(newMode);
    viewRef.current?.dispatch({
      changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" },
    });
    showModeChangeToast(newMode);
    sessionStorage.setItem("editorMode", newMode);
  }, []);

  // Wrap sendContent in useCallback
  const sendContent = useCallback(() => {
    const content = viewRef.current?.state.doc.toString() || "";
    const filteredContent = content.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    
    console.log("sendContent called:", {
      mode,
      content,
      filteredContent,
      isIframe,
      socketConnected: isSocketConnected,
      socketExists: !!socket
    });

    // Save content to sessionStorage
    sessionStorage.setItem("editorContent", content);

    // Check for mode change
    if (filteredContent === "command" && isIframe) {
      changeMode("command");
      return;
    } else if (filteredContent === "llm") {
      changeMode("llm");
      return;
    }

    // Handle different modes
    if (mode === "llm") {
      if (!socket || !isSocketConnected) {
        console.error("Socket not connected in LLM mode");
        showSocketErrorToast();
        return;
      }

      console.log("Sending to LLM via socket:", {
        op: "llm",
        from: sessionID,
        content
      });
      
      socket.emit("monitor", { op: "llm", from: sessionID, content });
      showLLMSentToast();
      return;
    } else if (mode === "command") {
      if (!isIframe) {
        console.log("Command mode only works in iframe context");
        showIframeErrorToast();
        return;
      }
      console.log("Sending to command mode:", content);
      sendPostMessage(content);
      return;
    }

    // If we get here, it's an invalid mode
    console.log("Invalid mode:", { mode, isIframe });
    showInvalidModeToast(mode);
  }, [mode, isIframe, socket, isSocketConnected, sessionID, setMode]);  // Add all dependencies

  // Regular function that will always have current state values
  const handleEnterKey = (view: EditorView) => {
    const content = view.state.doc.toString();
    const lines = content.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    console.log("handleEnterKey called", { isTestMode, currentTestStep, lastLine });
    
    // Handle test/testall commands
    if (lastLine === "test" || lastLine === "testall") {
      if (lastLine === "test") {
        console.log("Starting test mode");
        // Clear the editor first
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "" }
        });
        setIsTestMode(true);
        // Display first entry after state updates
        setTimeout(() => {
          const entry = TEST_CONVERSATION[0];
          updateContent(view, formatEntry(entry, true), "replace");
        }, 0);
        setCurrentTestStep(1);
        return true;
      } else { // testall
        console.log("Starting testall mode");
        setIsTestMode(false);
        const allContent = TEST_CONVERSATION.map((entry, index) => 
          formatEntry(entry, index === 0)
        ).join("");
        updateContent(view, allContent, "replace");
        
        if (isIframe) {
          TEST_CONVERSATION.forEach(entry => {
            if (entry.actions?.length) {
              sendPostMessage(entry.actions.join("\n"));
            }
          });
        }
        return true;
      }
    }
    
    // Handle test mode conversation
    if (isTestMode) {
      console.log("Test mode state:", { currentTestStep, lastLine });
      
      if (currentTestStep >= TEST_CONVERSATION.length - 1) {
        console.log("Reached end of conversation");
        setIsTestMode(false);
        return true;
      }
      
      const currentEntry = TEST_CONVERSATION[currentTestStep];
      const nextStep = currentTestStep + 1;
      const nextEntry = TEST_CONVERSATION[nextStep];
      
      // If current entry is from user (U), check for input
      if (currentEntry.from === "U") {
        const hasResponse = lastLine.trim() !== "";
        if (!hasResponse) {
          // Add a blank line with user styling for input
          view.dispatch({
            changes: { from: view.state.doc.length, insert: "\n" },
            selection: { anchor: view.state.doc.length + 1 }
          });
          // Force update of decorations
          view.dispatch({
            effects: StateEffect.appendConfig.of([])
          });
        } else {
          // If response given, show the scripted user response
          updateContent(view, formatEntry(currentEntry, true), "append");
        }
        // Move to next entry (Yeshie's response) after a delay
        setTimeout(() => {
          updateContent(view, formatEntry(nextEntry, true), "replace");
          setCurrentTestStep(nextStep + 1);
        }, 300);
      } else {
        // For Yeshie's entries, just show the next entry
        updateContent(view, formatEntry(nextEntry, true), "replace");
        setCurrentTestStep(nextStep);
      }
      
      // Handle any actions for the new entry
      if (isIframe && nextEntry.actions?.length) {
        sendPostMessage(nextEntry.actions.join("\n"));
      }
      
      return true;
    }
    
    // Default behavior: add a single newline
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: pos, insert: "\n" },
      selection: { anchor: pos + 1 }
    });
    return true;
  };

  // Update the ref whenever relevant state changes
  useEffect(() => {
    handleEnterKeyRef.current = handleEnterKey;
  }, [isTestMode, currentTestStep, mode, isIframe]);

  // Add key handlers with useCallback
  const handleSave = useCallback(() => {
    sendContent();
    return true;
  }, [sendContent]);

  const handleEnter = useCallback(() => {
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
      console.error("Error in select all:", e);
    }
    return true;
  }, []);

  // Initialize editor only once
  const initializeEditor = useCallback(() => {
    if (!editorRef.current) return;

    const startState = EditorState.create({
      doc: DEFAULT_CONTENT,
      extensions: [
        basicSetup,
        Prec.highest(
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: handleSave,
            },
            {
              key: "Mod-Enter",
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
              run: (view) => {
                return handleEnterKeyRef.current?.(view) ?? false;
              }
            }
          ])
        ),
        keymap.of([...defaultKeymap, indentWithTab]),
        markdown(),
        EditorView.lineWrapping,
        history(),
        backgroundField
      ],
    });

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    viewRef.current = new EditorView({ state: startState, parent: editorRef.current });
  }, [handleSave, handleEnter, handleSelectAll]);

  // Initialize editor on mount
  useEffect(() => {
    initializeEditor();
    return () => {
      viewRef.current?.destroy();
    };
  }, [initializeEditor]);

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
            A Collaboration Page - {mode.toUpperCase()} Mode
          </Heading>
          <h3>
            {isIframe ? " (Iframe)" : "Native"}
          </h3>
          <Box
            ref={editorRef}
            flex="1"
            border="1px solid"
            borderColor="gray.200"
            width="100%"
            overflow="auto"
            padding="2px"
          />
        </VStack>
      </Box>
    </>
  );
};

export default CollaborationPage;