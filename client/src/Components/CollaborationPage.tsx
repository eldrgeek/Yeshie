import React, { useEffect, useRef, useCallback } from 'react';
import { Box, VStack, Heading, useToast  } from "@chakra-ui/react";
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
}

const CollaborationPage: React.FC<CollaborationPageProps> = ({ socket, sessionID }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const toast = useToast(); 
  
  const sendContent = useCallback(() => {
    console.log("send content ")
    const content = viewRef.current?.state.doc.toString() || "";
      
    if (socket && socket.connected) {
      // Send message via socket if available and connected
      socket.emit("monitor", { op: "llm", from: sessionID, content });
      toast({
        title: "LLM message sent via socket",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
    } else {
      // Send message via postMessage if socket is not available
      window.parent.postMessage({ type: "monitor", op: "llm", from: sessionID, content }, "*");
      toast({
        title: "LLM message sent via postMessage",
        status: "info",
        duration: 2000,
        isClosable: true,
      });
    }
  
  }, [socket, sessionID]);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: "Mike:",
      extensions: [
        basicSetup,
        Prec.highest(keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              console.log("Save shortcut triggered");
              sendContent();
              return true;
            }
          },
          { 
            key: "Mod-Enter", 
            preventDefault: true,
            run: () => { 
              console.log("Mod-Enter triggered"); 
              sendContent();
              return true; 
            } 
          },
        ])),
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
      ]
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [sendContent]);

  useEffect(() => {
    if (!socket) return;

    socket.on('response', ({ from, cmd, request, response }) => {
      console.log("response", from, cmd, request, response);
      if (cmd === "append" && viewRef.current) {
        const doc = viewRef.current.state.doc;
        viewRef.current.dispatch({
          changes: { from: doc.length, insert: "\n" + response }
        });
      }
    });

    return () => {
      socket.off('response');
    };
  }, [socket]);

  return (
    
    <Box p={0} width="100hw" height="100vh" display="flex" flexDirection="column">
      <VStack width="100hw" spacing={2} align="stretch" flex="1" overflow="hidden">
        <Heading as="h2" size="lg">Collaboration Page</Heading>
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