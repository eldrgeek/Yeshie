import { forwardRef, useImperativeHandle } from 'react';
import { useState, useEffect, useCallback, useRef } from "react";
import { Socket } from "socket.io-client";
import { Button, HStack, VStack, useToast } from "@chakra-ui/react";
import { FiSave, FiChevronRight, FiChevronLeft } from "react-icons/fi";
import { FaUndo, FaRedo } from "react-icons/fa";
import { EditorView } from "@codemirror/view";
import { indentMore, indentLess } from "@codemirror/commands";
import { EditorState, Compartment } from "@codemirror/state";
import { redo, undo } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { createEditorExtensions } from '../editor/config';

interface ScriptEditorProps {
  socket: Socket;
  sessionID: string;
}

const ScriptEditor = forwardRef<unknown, ScriptEditorProps>(({ socket, sessionID }, ref) => {
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const debugging = false;
  const toast = useToast();
  const lastSaveTimeRef = useRef<number>(0);

  const handleSave = () => {
    if (editorViewRef.current) {
      const contents = editorViewRef.current.state.doc.toString();
      const firstLine = contents.split("\n")[0];
      if (firstLine.startsWith("#file ")) {
        const filename = firstLine.substring(6).trim();
        if (window.confirm(`Save file as ${filename}?`)) {
          socket.emit("monitor", { op: "editor/save", sessionID, contents });
          toast({
            title: "File saved",
            description: `Saved as ${filename}`,
            status: "success",
            duration: 3000,
            isClosable: true,
          });
        }
      } else {
        socket.emit("monitor", { op: "save", sessionID, contents });
        toast({
          title: "Content saved",
          status: "success",
          duration: 3000,
          isClosable: true,
        });
      }
    }
  };

  useEffect(() => {
    if (editorRef.current && !editorViewRef.current) {
      const savedContent = sessionStorage.getItem(`editorContent_${sessionID}`);
      const state = EditorState.create({
        doc: savedContent || "this is a test",
        extensions: [
          createEditorExtensions({
            onSave: () => {
              console.log("Save shortcut triggered");
              handleSave();
              return true;
            },
            onEnter: () => false,
            onSelectAll: () => false,
            onRegularEnter: () => false,
            theme: isDarkTheme ? oneDark : []
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const currentTime = Date.now();
              const newContent = update.state.doc.toString();
              if (currentTime - lastSaveTimeRef.current >= 1000) {
                sessionStorage.setItem(`editorContent_${sessionID}`, newContent);
                lastSaveTimeRef.current = currentTime;
              }
            }
          }),
        ],
      });

      editorViewRef.current = new EditorView({
        state: state,
        parent: editorRef.current,
      });

      editorViewRef.current.focus();
    }
  }, [sessionID, handleSave, isDarkTheme]);

  useEffect(() => {
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({
        effects: themeCompartment.current.reconfigure(isDarkTheme ? oneDark : []),
      });
    }
  }, [isDarkTheme]);

  useImperativeHandle(ref, () => ({
    handleSave
  }));

  const handleAppend = useCallback((payload: { data: string | string[] }) => {
    if (editorViewRef.current) {
      const { data } = payload;
      const currentContent = editorViewRef.current.state.doc.toString();
      const newContent = Array.isArray(data) ? data.join("\n") : data;
      editorViewRef.current.dispatch({
        changes: { from: currentContent.length, insert: "\n" + newContent },
      });
    }
  }, []);

  const handleIndent = useCallback(() => {
    if (editorViewRef.current) {
      indentMore(editorViewRef.current);
    }
  }, []);

  const handleOutdent = useCallback(() => {
    if (editorViewRef.current) {
      indentLess(editorViewRef.current);
    }
  }, []);

  const handleLoad = useCallback((payload: { data: string | string[] }) => {
    if (editorViewRef.current) {
      const { data } = payload;
      const newContent = Array.isArray(data) ? data.join("\n") : data;
      editorViewRef.current.dispatch({
        changes: {
          from: 0,
          to: editorViewRef.current.state.doc.length,
          insert: newContent,
        },
      });
    }
  }, []);

  useEffect(() => {
    socket.on("editor/append", handleAppend);
    socket.on("editor/load", handleLoad);

    return () => {
      socket.off("editor/append", handleAppend);
      socket.off("editor/load", handleLoad);
    };
  }, [socket, handleAppend, handleLoad]);

  return (
    <VStack spacing={4} align="stretch"> 
      <HStack spacing={1} alignItems="flex-start"> 
        <Button size="sm" leftIcon={<FaUndo />} onClick={() => undo(editorViewRef.current!)}>
          Undo
        </Button>
        <Button size="sm" leftIcon={<FaRedo />} onClick={() => redo(editorViewRef.current!)}>
          Redo
        </Button>
        <Button size="sm" leftIcon={<FiChevronRight />} onClick={handleIndent}>
          Indent
        </Button>
        <Button size="sm" leftIcon={<FiChevronLeft />} onClick={handleOutdent}>
          Outdent
        </Button>
        <Button size="sm" leftIcon={<FiSave />} onClick={handleSave}>
          Save
        </Button>
        <Button size="sm" onClick={() => setIsDarkTheme(!isDarkTheme)}>
          {isDarkTheme ? "Light Theme" : "Dark Theme"}
        </Button>
      </HStack>
      <div
        id="CodeMirrorEditor"
        ref={editorRef}
        style={{
          backgroundColor: isDarkTheme ? "#282c34" : "white",
          color: isDarkTheme ? "white" : "black",
          border: "1px solid #E2E8F0",
          borderRadius: "0.375rem",
          padding: "0.5rem",
          minHeight: "200px",
          maxHeight: "600px",
          overflowY: "auto",
          textAlign: "left",
        }}
      />
      {debugging && (
        <HStack spacing={2}>
          <Button
            onClick={() =>
              handleAppend({ data: "Test append data\nMultiple lines" })
            }
          >
            Append
          </Button>
          <Button onClick={() => handleLoad({ data: "Test load data" })}>
            Load
          </Button>
        </HStack>
      )}
    </VStack>
  );
});

export default ScriptEditor;