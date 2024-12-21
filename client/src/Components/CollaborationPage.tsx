import React, { useEffect, useRef, useCallback, useState } from "react";
import { Box, VStack, Heading, useToast } from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Prec, Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab, history } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { debounce } from "lodash";
import { collab, receiveUpdates, sendableUpdates, getSyncedVersion } from '@codemirror/collab';

/*

navto https://www.github.com
//click a "Sign in" type //#login_ field "ishipcode"
//type #password.
"awesometools1"
//click .js-sign-in-button //click -js-octocaptcha-form-submit
//message Enter your authenticat`io`n code navto https://www.github.com
*/

interface CollaborationPageProps {
  socket: Socket | null;
  sessionID: string;
  logMessages: string[]; // Add this line
  // Remove the isIframe prop
}

// Add this function to extract the conversation ID
const extractConversationId = (content: string): string => {
  const firstLine = content.split('\n')[0].trim();
  return firstLine.startsWith('# ') ? firstLine.substring(2) : '';
};

const CollaborationPage: React.FC<CollaborationPageProps> = ({
  socket,
  sessionID,
  logMessages: initialLogMessages,
}) => {
  const [logMessages, setLogMessages] = useState<string[]>(
    initialLogMessages || []
  ); // Initialize state
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const innerToast = useToast();
  const toast = (opts:any) => {
    console.log("TOAST", opts.title)
    innerToast(opts)
  }
  const isIframe = window.self !== window.top;

  const [mode, setMode] = useState<"default" | "command" | "llm">(
    isIframe ? "command" : "llm"
  );

  const [conversationId, setConversationId] = useState<string>('');

  const updateConversationId = useCallback(
    debounce((content: string) => {
      const newConversationId = extractConversationId(content);
      if (newConversationId !== conversationId) {
        setConversationId(newConversationId);
        if (socket) {
          socket.emit('conversation:', sessionID, newConversationId);
        }
      }
    }, 500),
    [conversationId, sessionID, socket]
  );

  const sendContent = useCallback(() => {
    const content = viewRef.current?.state.doc.toString() || "";
    const filteredContent = content.replace(/\/\*[\s\S]*?\*\//g, "").trim();

    // Save content to sessionStorage
    sessionStorage.setItem("editorContent", content);

    // Restore content from sessionStorage
    const savedContent = sessionStorage.getItem("editorContent");
    if (savedContent) {
      viewRef.current?.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: savedContent,
        },
      });
    }

    // Insert log messages into the editor
    if (logMessages) {
      const messages = logMessages.join("\n")
      viewRef.current?.dispatch({
        changes: { from: viewRef.current.state.doc.length, insert: messages },
      });
    }

    // Check for mode change
    if (filteredContent === "command" && isIframe) {
      setMode("command");
      viewRef.current?.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" },
      });
      toast({
        title: "Switched to COMMAND mode",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
      return;
    } else if (filteredContent === "llm") {
      setMode("llm");
      viewRef.current?.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" },
      });
      toast({
        title: "Switched to LLM mode",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    if (mode === "llm" && socket && socket.connected) {
      socket.emit("monitor", { op: "llm", from: sessionID, content, conversationId }); // Include conversationId
      toast({
        title: "Command sent to LLM via socket",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
    } else if (mode === "command") {
      sendPostMessage(content);
    } else {
      // Default behavior (unchanged)
      if (socket && socket.connected) {
        socket.emit("monitor", { op: "llm", from: sessionID, content, conversationId }); // Include conversationId
        toast({
          title: "LLM message sent via socket",
          status: "info",
          duration: 2000,
          isClosable: true,
        });
      } else {
        sendPostMessage(content);
      }
    }
  }, [socket, sessionID, mode, isIframe, logMessages, conversationId]); // Add conversationId to dependencies
  const filterString = (inputString: string): string =>{
    const pattern = /\/\*\*[\s\S]*?\*\*\//g;
    return inputString.replace(pattern, '');
}
  const sendPostMessage = (content: string) => {
    content = filterString(content);
    const lines = content.split("\n").filter(line => line.trim()); // Filter out empty lines
    console.log("LINES", lines);

    const sendLine = (index: number) => {
        if (index >= lines.length) return;

        const line = lines[index].trim();
        if (!line.startsWith("//")) {
            console.log(`SENDING line '${line}'`);

            if (line.startsWith('message ')) {
                toast({
                    title: "Message",
                    description: line.substring(8),
                    status: "info",
                    duration: 2000,
                    isClosable: true,
                });
            } else {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage(
                        { type: "monitor", op: mode, from: sessionID, line },
                        "*"
                    );

                    toast({
                        title: "PostMessage",
                        description: line,
                        status: "info",
                        duration: 2000,
                        isClosable: true,
                    });
                } else {
                    toast({
                        title: "Cannot send message: No parent window",
                        status: "error",
                        duration: 2000,
                        isClosable: true,
                    });
                }
            }
        }
        // Schedule the next line to be sent after 1 second
        setTimeout(() => sendLine(index + 1), 1000);
    };

    // Start sending lines
    sendLine(0);
  };

  const saveContent = useCallback(
    debounce(() => {
      const content = viewRef.current?.state.doc.toString() || "";
      // Save content to sessionStorage
      sessionStorage.setItem("editorContent", content);
    }, 1000),
    []
  ); // Debounce for 1 second

  const editorStateRef = useRef<EditorState | null>(null); // New ref for editor state

  const initializeEditor = useCallback(() => {
    if (!editorRef.current) return;
    console.log("Editor instantiated", socket)
    // Retrieve saved content from sessionStorage
    const savedContent = sessionStorage.getItem("editorContent") || "Yeshie: add voice to github";

    const startState = EditorState.create({
      doc: savedContent,
      extensions: [
        basicSetup,
        Prec.highest(
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                console.log("Save shortcut triggered");
                sendContent();  
                return true;
              },
            },
            {
              key: "Mod-Enter",
              preventDefault: true,
              run: () => {
                console.log("Mod-Enter triggered");
                sendContent();
                return true;
              },
            },
          ])
        ),
        keymap.of([...defaultKeymap, indentWithTab]),
        markdown(),
        EditorView.lineWrapping,
        history(),
        themeCompartment.current.of([]),
        collab({ clientID: sessionID }), // Update to use sessionID
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            saveContent();
            updateConversationId(update.state.doc.toString());
            if (socket) {
              const updates = sendableUpdates(update.state);
              if (updates.length > 0) {
                console.log("Pushing updates");
                socket.emit('pushUpdates', sessionID, getSyncedVersion(update.state), updates, conversationId);
              }
            }
          }
        }),
      ],
    });
    editorStateRef.current = startState; // Store the initial state

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const view = new EditorView({ state: startState, parent: editorRef.current });
    viewRef.current = view;

    // Pull initial updates
    if (socket) {
      socket.emit('pullUpdates', sessionID, 0, conversationId);
    }
  }, [socket, sessionID, saveContent, sendContent, updateConversationId, conversationId]);

  useEffect(() => {
    initializeEditor(); // Call to initialize the editor
  }, [initializeEditor]);

  useEffect(() => {
    if (!socket || !viewRef.current || !editorStateRef.current) return;

    const handleReceiveUpdates = (updatedConversationId: string, updates: any[]) => {
      console.log("Got updates for conversation", updatedConversationId);
      if (!editorStateRef.current) {
        console.error("Editor state is not initialized");
        return;
      }
      if (!viewRef.current) {
        console.error("Editor view is not initialized");
        return;
      }
      if (updatedConversationId === conversationId) {
        console.log("1")
        const newState = receiveUpdates(editorStateRef.current, updates);
        console.log("2")
        viewRef.current.update([newState]);
        console.log("3")
        editorStateRef.current = viewRef.current.state;
      }
    };

    const handleResponse = ({ from, cmd, request, response, conversationId: responseConversationId }: any) => {
      console.log("Response received:", { from, cmd, request, response, responseConversationId });
      
      // Only handle responses for the current conversation
      if (responseConversationId === conversationId || !responseConversationId) {
        if (cmd === "append" && viewRef.current) {
          const currentState = viewRef.current.state;
          const transaction = currentState.update({
            changes: { 
              from: currentState.doc.length, 
              insert: "\n\nResponse:\n" + response 
            }
          });
          viewRef.current.update([transaction]);
          editorStateRef.current = transaction.state;
          
          // Scroll to the bottom
          const lastLine = viewRef.current.state.doc.lines;
          viewRef.current.dispatch({
            effects: EditorView.scrollIntoView(viewRef.current.state.doc.length)
          });
        }
      }
    };

    socket.on('receiveUpdates', handleReceiveUpdates);
    socket.on("response", handleResponse);
    socket.on("error", (error) => {
      console.error("LLM Error:", error);
      if (viewRef.current) {
        const currentState = viewRef.current.state;
        const transaction = currentState.update({
          changes: { 
            from: currentState.doc.length, 
            insert: "\n\nError:\n" + error.message 
          }
        });
        viewRef.current.update([transaction]);
        editorStateRef.current = transaction.state;
      }
    });

    return () => {
      socket.off("response", handleResponse);
      socket.off('receiveUpdates', handleReceiveUpdates);
      socket.off("error");
    };
  }, [socket, sessionID, conversationId]);

  useEffect(() => {
    const handleLogMessage = (event: MessageEvent) => {
      if (event.data.type === "log") {
        console.log("Received log messages:", event.data.messages);
        // Add received messages to the logMessages state
        setLogMessages((prevMessages) => [
          ...prevMessages,
          ...event.data.messages,
        ]);
        // Clear logMessages after processing (if needed)
        // setLogMessages([]); // Uncomment if you want to clear after use
      }
    };

    window.addEventListener("message", handleLogMessage);

    return () => {
      window.removeEventListener("message", handleLogMessage);
    };
  }, []); // Run once on mount

  useEffect(() => {
    const handleYeshieResponse = (event: MessageEvent) => {
        if (event.data.type === "commandResult" ) {
          console.log(event)
            const responseContent = event.data.result; // Assuming the response contains the content
            const currentState = viewRef.current?.state;
            if (currentState) {
                const transaction = currentState.update({
                    changes: { from: currentState.doc.length, insert: "\n" + responseContent }
                });
                viewRef.current?.update([transaction]);
                editorStateRef.current = transaction.state; // Update the editor state ref
            }
        }
    };

    window.addEventListener("message", handleYeshieResponse);

    return () => {
        window.removeEventListener("message", handleYeshieResponse);
    };
  }, []); // Run once on mount

  return (
    <Box
      p={0}
      width="100hw"
      height="100vh"
      display="flex"
      flexDirection="column"
    >
      <VStack
        width="100hw"
        spacing={2}
        align="stretch"
        flex="1"
        overflow="hidden"
      >
        <Heading as="h2" size="lg">
          A Collaboration Page - {mode.toUpperCase()} Mode
         </Heading>
         <h3>
         {isIframe ? " (Iframe)" : "Native"}
          {conversationId ? `/: ${conversationId}` : ""} 
     
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
  );
};

export default CollaborationPage;
