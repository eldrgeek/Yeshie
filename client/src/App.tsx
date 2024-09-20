import React,{ useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import { useSearchParam } from "react-use";
import { io, Socket } from "socket.io-client";
import { ChakraProvider, Box, VStack, Heading, Text } from "@chakra-ui/react";
import Rewind from "./Components/Rewind";
import ScriptEditor from "./Components/ScriptEditor";

function App() {
  const [message, setMessage] = useState("");
  const urlSession = useSearchParam("session");
  const [session, setSession] = useState(urlSession);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const scriptEditorRef = useRef<{ handleSave: () => void } | null>(null);
  const rewindRef = useRef<{ handleGoClick: () => void; handleKeyDown: (event: KeyboardEvent) => void } | null>(null);

  useEffect(() => {
    const oldLog = console.log;
    console.log = (...args) => {
      if (socket) socket.emit("clientLog", args);
      oldLog(...args);
    };
    return () => {
      console.log = oldLog;
    };
  }, [socket]);

  useEffect(() => {
    fetch("/api/hello")
      .then((response) => response.json())
      .then((data) => setMessage(data.message));
  }, []);

  useEffect(() => {
    const newSocket = io("http://localhost:3000", {
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      setConnected(true);
      if (!session) {
        console.log("no session");
        newSocket.emit("session?", "client");
      } else {
        newSocket.emit("session:", session);
      }
    });

    newSocket.on("session:", (session) => {
      newSocket.emit("session:", session, "client");
      history.pushState({}, "", location.pathname + `?session=${session}`);
      setSession(session);
    });

    newSocket.on("serverLog", (message) => {
      console.log("serverLogs", ...message);
      setServerLogs((prevLogs) => [...prevLogs, ...message]);
    });

    newSocket.on("connect_error", (error) => {
      console.error("Connection error:", error);
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [session]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (scriptEditorRef.current) {
          scriptEditorRef.current.handleSave();
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key === "g") {
        event.preventDefault();
        if (rewindRef.current) {
          rewindRef.current.handleGoClick(); // Pass the event here
        }
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <ChakraProvider>
      <div id="aiaugie" data-server="http://localhost:3000" 
      data-session={session}
style={{display: "none"}}></div>
      <Box className="App" p={1}>
        <VStack spacing={4} align="stretch">
          <Box 
            width="100%" 
            height="100%" 
            display="flex" 
            justifyContent="center" 
            alignItems="center"
          >
            <Box transform="scale(0.8)">
              <Rewind socket={socket} sessionId={session || ''} ref={rewindRef as React.RefObject<{ handleGoClick: () => void; handleKeyDown: (event: KeyboardEvent) => void }>} />
            </Box>
          </Box>
          <Heading as="h3" size="md">
            {connected ? "Connected" : "Not Connected"}
          </Heading>
          <Text>Message given from server: {message}</Text>

          {socket && session && (
            <ScriptEditor
              socket={socket}
              sessionID={session}
              ref={scriptEditorRef as React.RefObject<{ handleSave: () => void }>}
            />
          )}

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
    </ChakraProvider>
  );
}

export default App;