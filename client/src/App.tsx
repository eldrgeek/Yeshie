import { useState, useEffect } from "react";
import "./App.css";
import { useSearchParam } from "react-use";
import { io, Socket } from "socket.io-client";
import Rewind from "./Components/Rewind";

// Define isDevelopment
// const isDevelopment = import.meta.env.DEV;

function App() {
  const [message, setMessage] = useState("");
  const edit = useSearchParam("edit");
  const urlSession = useSearchParam("session");
  const [session, setSession] = useState(urlSession);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  useEffect(() => {
    console.log("USE EFFECT CALLED")
    const oldLog = console.log
    console.log = (...args)=>{
      if(socket) socket.emit('clientLog',args)
      oldLog(...args)
    }
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
      history.pushState({}, "", location.pathname + `?session=${session}`)

      setSession(session);
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
      <div>
        <h1> {connected ? "Connected" : "not"}</h1>
        <div>edit: {edit || "🤷‍♂️"}</div>
        <div>
          <button
            onClick={() =>
              history.pushState({}, "", location.pathname + "?edit=123")
            }
          >
            Edit post 123 (?edit=123)
          </button>
        </div>
        <div>
          <button
            onClick={() =>
              history.pushState({}, "", location.pathname + "?edit=999")
            }
          >
            Edit post 999 (?edit=999)
          </button>
        </div>
        <div>
          <button onClick={() => history.pushState({}, "", location.pathname)}>
            Close modal
          </button>
        </div>
      </div>
      <h1>Vite + React</h1>
      <p>Message given from server: {message}</p>
    </div>
  );
}

export default App;
