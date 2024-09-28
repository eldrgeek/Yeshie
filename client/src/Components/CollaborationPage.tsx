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

interface CollaborationPageProps {
  socket: Socket | null;
  sessionID: string;
  // Remove the isIframe prop
}

const CollaborationPage: React.FC<CollaborationPageProps> = ({
  socket,
  sessionID,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const toast = useToast();
  const isIframe = window.self !== window.top;

  const [mode, setMode] = useState<'default' | 'command' | 'llm'>(isIframe ? 'command' : 'llm');

  // Add this line to detect if running in an iframe

  const sendContent = useCallback(() => {
    const content = viewRef.current?.state.doc.toString() || "";

    // Check for mode change
    if (content.trim() === 'command' && isIframe) {
      setMode('command');
      viewRef.current?.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' }
      });
      toast({
        title: "Switched to COMMAND mode",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
      return;
    } else if (content.trim() === 'llm') {
      setMode('llm');
      viewRef.current?.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' }
      });
      toast({
        title: "Switched to LLM mode",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    if (mode === 'llm' && socket && socket.connected) {
      socket.emit("monitor", { op: "llm", from: sessionID, content });
      toast({
        title: "Command sent to LLM via socket",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
    } else if (mode === 'command') {
      sendPostMessage(content);
    } else {
      // Default behavior (unchanged)
      if (socket && socket.connected) {
        socket.emit("monitor", { op: "llm", from: sessionID, content });
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
  }, [socket, sessionID, mode, isIframe]);

  const sendPostMessage = (content: string) => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "monitor", op: mode, from: sessionID, content },
        "*"
      );
      toast({
        title: "LLM message sent via postMessage",
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
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: "Mike:",
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
            // Handle document changes if needed
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [sendContent]);

  useEffect(() => {
    if (!socket) return;

    socket.on("response", ({ from, cmd, request, response }) => {
      console.log("response", from, cmd, request, response);
      if (cmd === "append" && viewRef.current) {
        const doc = viewRef.current.state.doc;
        viewRef.current.dispatch({
          changes: { from: doc.length, insert: "\n" + response },
        });
      }
    });

    return () => {
      socket.off("response");
    };
  }, [socket]);

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
          {isIframe ? " (Iframe)" : ""}
        </Heading>
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
