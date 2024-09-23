import React, { useEffect, useState } from 'react';
import { Box, VStack, Heading, Text } from "@chakra-ui/react";
import { Socket } from "socket.io-client";

interface LoggingProps {
  socket: Socket | null;
  connected: boolean;
  message: string;
}

const Logging: React.FC<LoggingProps> = ({ socket, connected, message }) => {
    const [serverLogs, setServerLogs] = useState<string[]>([]);
  
    useEffect(() => {
    if (socket) {
      socket.on('log', (log: string) => {
        setServerLogs((serverLogs: any) => [...serverLogs, log]);
      });
    }
  }, [socket]);

  return (
    <Box p={4}>
      <VStack spacing={4} align="stretch">
        <Heading as="h3" size="md">
          {connected ? "Connected" : "Not Connected"}
        </Heading>
        <Text>Message given from server: {message}</Text>
        <Box className="server-logs">
          <Heading as="h4" size="sm">
            Server Logs:
          </Heading>
          {serverLogs.map((log, index) => (
            <Text key={index}>{log}</Text>
          ))}
        </Box>
      </VStack>
    </Box>
  );
};

export default Logging;