import React, { useEffect, useRef, useCallback, useState } from "react";
import { Box, VStack, Heading, useToast } from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { history } from "@codemirror/commands";
// import { oneDark } from "@codemirror/theme-one-dark";
import { Compartment } from "@codemirror/state";
import { debounce } from "lodash"; // Add lodash import

/*
navto https://www.github.com
//click a "Sign in" type //#login_ field "ishipcode"
//type #password.
"awesometools1"
//click .js-sign-in-button //click -js-octocaptcha-form-submit
//message Enter your authentication code navto https://www.github.com
*/

interface CollaborationPageProps {
  socket: Socket | null;
  sessionID: string;
  logMessages: string[]; // Add this line
  // Remove the isIframe prop
}

const CollaborationPage: React.FC<CollaborationPageProps> = ({
  socket,
  sessionID,
  logMessages: initialLogMessages, // Rename to avoid conflict
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

  const [conversationId, setConversationId] = useState<string | null>(null); // Add conversationId state

  // Add this line to detect if running in an iframe

  const extractConversationId = (content: string): string | null => { // New function to extract conversation ID
    const lines = content.split('\n');
    const firstLine = lines[0].trim();
    if (firstLine.startsWith('# ')) {
        return firstLine.substring(2).trim();
    }
    return null;
  };

  const sendContent = useCallback(() => {
    const content = viewRef.current?.state.doc.toString() || "";
    const filteredContent = content.replace(/\/\*[\s\S]*?\*\//g, "").trim();

    const newConversationId = extractConversationId(content); // Extract conversation ID
    if (newConversationId !== conversationId) {
        setConversationId(newConversationId); // Update conversation ID state
    }

    // Prepare log messages for insertion

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
      if(!line.startsWith("//")){
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

            // Insert log messages into the editor
            // if (logMessages) {
            //   const messages = logMessages.join("\n")
            //   viewRef.current?.dispatch({
            //     changes: {
            //       from: viewRef.current.state.doc.length,
            //       insert: messages,
            //     },
            //   });
            // }

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

  useEffect(() => {
    if (!editorRef.current) return;

    // Retrieve saved content from sessionStorage
    const savedContent = sessionStorage.getItem("editorContent") || "Mike:"; // Default to "Mike:" if no saved content

    const state = EditorState.create({
      doc: savedContent, // Use saved content as initial document
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
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            saveContent(); // Call saveContent on document change
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [sendContent, saveContent]); // Add saveContent to dependencies

  useEffect(() => {
    const savedContent = sessionStorage.getItem("editorContent");
    if (savedContent && viewRef.current) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: savedContent,
        },
      });
    }
  }, []); // Run once on mount

  useEffect(() => {
    if (!socket) return;

    socket.on("response", ({ from, cmd, request, response, conversationId: responseConversationId }) => { // Handle response with conversationId
        console.log("response", from, cmd, request, response, responseConversationId);
        if (cmd === "append" && viewRef.current && responseConversationId === conversationId) { // Check conversationId
            const doc = viewRef.current.state.doc;
            viewRef.current.dispatch({
                changes: { from: doc.length, insert: "\n" + response },
            });
        }
    });

    return () => {
        socket.off("response");
    };
  }, [socket, conversationId]); // Add conversationId to dependencies

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
          Collaboration Page - {mode.toUpperCase()} Mode
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