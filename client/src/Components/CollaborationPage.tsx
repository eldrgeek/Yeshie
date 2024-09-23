import React, { useEffect, useRef, useCallback } from 'react';
import { Box, VStack, Heading } from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { defaultKeymap } from "@codemirror/commands";

interface CollaborationPageProps {
  socket: Socket | null;
  sessionID: string;
}

const CollaborationPage: React.FC<CollaborationPageProps> = ({ socket, sessionID }) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  
  const sendContent = useCallback(() => {
    if (viewRef.current && socket) {
      const contents = viewRef.current.state.doc.toString();
      socket.emit("collaboration", { to: "llm", name: "any", from: sessionID, contents });
    }
  }, [socket, sessionID]);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: "Let's start collaborating!",
      extensions: [
        basicSetup,
        keymap.of([
          ...defaultKeymap,
          { key: "Mod-Enter", run: () => { sendContent(); return true; } }
        ])
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

    socket.on('response', ({ from, cmd, contents }) => {
      console.log("response", from, cmd, contents);
      if (cmd === "append" && viewRef.current) {
        const doc = viewRef.current.state.doc;
        viewRef.current.dispatch({
          changes: { from: doc.length, insert: "\n" + contents }
        });
      }
    });

    return () => {
      socket.off('response');
    };
  }, [socket]);

  return (
    <Box p={4}>
      <VStack spacing={4} align="stretch">
        <Heading as="h2" size="lg">Collaboration Page</Heading>
        <Box ref={editorRef} height="400px" border="1px solid" borderColor="gray.200" />
      </VStack>
    </Box>
  );
};

export default CollaborationPage;