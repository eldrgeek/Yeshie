import { useState, useEffect } from "react";
import "./App.css";
import { useSearchParam } from "react-use";
import { io, Socket } from "socket.io-client";
import Rewind from "./Components/Rewind";

// Define isDevelopment
// const isDevelopment = import.meta.env.DEV;

function App() {
  const [message, setMessage] = useState("");
  const urlSession = useSearchParam("session");
  const [session, setSession] = useState(urlSession);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [serverLogs, setServerLogs] = useState<string[]>([]);

  useEffect(() => {
    const oldLog = console.log
    console.log = (...args)=>{
      if(socket) socket.emit('clientLog',args)
      oldLog(...args)
    }
    return ()=>{console.log = oldLog }
  }, []);
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
        console.log("EXISTING session");
        newSocket.emit("session:",session)
      }
      console.log("Connected to server");
    });

    newSocket.on("session:", (session) => {
      newSocket.emit("session:",session,"client")
      history.pushState({}, "", location.pathname + `?session=${session}`)

      setSession(session);
    });
    newSocket.on("serverLog", (message) => {
      console.log("serverLogs",...message)
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

  return (
    <div className="App">
      <Rewind socket={socket} />
      <h3> {connected ? "Connected" : "not"}</h3>
      <p>Message given from server: {message}</p>
      
      <div className="server-logs">
        <h4>Server Logs:</h4>
        {serverLogs.map((log, index) => (
          <p key={index}>{log}</p>
        ))}
      </div>
    </div>
  );
}

export default App;
