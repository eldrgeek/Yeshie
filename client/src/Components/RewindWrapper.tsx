import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Box, VStack } from "@chakra-ui/react";
import { Socket } from "socket.io-client";
import Rewind from "./Rewind";
import ScriptEditor from "./ScriptEditor";

interface RewindWrapperProps {
  socket: Socket | null;
  sessionId: string;
}

const RewindWrapper = forwardRef<
  { handleGoClick: () => void; handleKeyDown: (event: KeyboardEvent) => void; handleSave: () => void },
  RewindWrapperProps
>(({ socket, sessionId }, ref) => {
  const rewindRef = useRef<{ handleGoClick: () => void; handleKeyDown: (event: KeyboardEvent) => void } | null>(null);
  const scriptEditorRef = useRef<{ handleSave: () => void } | null>(null);

  useImperativeHandle(ref, () => ({
    handleGoClick: () => {
      if (rewindRef.current) {
        rewindRef.current.handleGoClick();
      }
    },
    handleKeyDown: (event: KeyboardEvent) => {
      if (rewindRef.current) {
        rewindRef.current.handleKeyDown(event);
      }
    },
    handleSave: () => {
      if (scriptEditorRef.current) {
        scriptEditorRef.current.handleSave();
      }
    }
  }));

  return (
    <VStack spacing={4} align="stretch">
      <Box 
        width="100%" 
        height="100%" 
        display="flex" 
        justifyContent="center" 
        alignItems="center"
      >
        <Box transform="scale(0.8)">
          <Rewind socket={socket} sessionId={sessionId} ref={rewindRef} />
        </Box>
      </Box>
      {socket && sessionId && (
        <ScriptEditor
          socket={socket}
          sessionID={sessionId}
          ref={scriptEditorRef}
        />
      )}
    </VStack>
  );
});

export default RewindWrapper;