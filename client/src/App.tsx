import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import { useSearchParam } from "react-use";
import { io, Socket } from "socket.io-client";
import { ChakraProvider, Box } from "@chakra-ui/react";
import CollaborationPage from "./Components/CollaborationPage";
import Logging from "./Components/Logging";
import RewindWrapper from "./Components/RewindWrapper";
import TipTapCollaboration from "./Components/TipTapCollaboration";
import MilkdownCollab from "./Components/MilkdownCollab";
import theme from "./styles/theme";

function App() {
  const [message, setMessage] = useState("");
  const urlSession = useSearchParam("session");
  const [session, setSession] = useState(urlSession);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentView, setCurrentView] = useState<
    "collaboration" | "logging" | "rewind" | "tiptap" | "milkdown"
  >("collaboration");
  // const [conversationId, setConversationId] = useState<string | null>(null); // New state for conversation ID

  const rewindWrapperRef = useRef<{
    handleGoClick: () => void;
    handleKeyDown: (event: KeyboardEvent) => void;
    handleSave: () => void;
  } | null>(null);

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
        window.parent.postMessage({ type: "sessionID", sessionID: session }, "*");
      }
    });

    newSocket.on("session:", (session) => {
      newSocket.emit("session:", session, "client");
      history.pushState({}, "", location.pathname + `?session=${session}`);
      setSession(session);
      window.parent.postMessage({ type: "sessionID", sessionID: session }, "*");

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

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Only handle number keys and specific commands
    const validKeys = ['1', '2', '3', '4', '5', '6', 's', 'g'];
    
    if ((event.metaKey || event.ctrlKey) && validKeys.includes(event.key)) {
      console.log("[App] handling shortcut:", event.key);
      
      switch (event.key) {
        case "4":
          event.preventDefault();
          setCurrentView("collaboration");
          break;
        case "1":
          event.preventDefault();
          setCurrentView("collaboration");
          break;
        case "2":
          event.preventDefault();
          setCurrentView("logging");
          break;
        case "3":
          event.preventDefault();
          setCurrentView("rewind");
          break;
        case "5":
          event.preventDefault();
          setCurrentView("tiptap");
          break;
        case "s":
          if (rewindWrapperRef.current) {
            event.preventDefault();
            rewindWrapperRef.current.handleSave();
          }
          break;
        case "g":
          if (rewindWrapperRef.current) {
            event.preventDefault();
            rewindWrapperRef.current.handleGoClick();
          }
          break;
        case "6":
          event.preventDefault();
          setCurrentView("milkdown");
          break;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <ChakraProvider theme={theme}>
      <div
        id="aiaugie"
        data-server="http://localhost:3000"
        data-session={session}
        style={{ display: "none" }}
      ></div>
      <Box className="App" p={0} width="100%">
        {currentView === "collaboration" && (
          <CollaborationPage
            socket={socket}
            sessionID={session || ""}
          />
        )}
        {currentView === "logging" && (
          <Logging socket={socket} connected={connected} message={message} />
        )}
        {currentView === "rewind" && (
          <RewindWrapper
            socket={socket}
            sessionId={session || ""}
            ref={rewindWrapperRef}
          />
        )}
        {currentView === "tiptap" && <TipTapCollaboration />}
        {currentView === "milkdown" && <MilkdownCollab />}
      </Box>
    </ChakraProvider>
  );
}

export default App;
