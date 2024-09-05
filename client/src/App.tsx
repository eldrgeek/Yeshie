import { useState, useEffect } from "react";
import "./App.css";
import { useSearchParam } from "react-use";
import { io } from 'socket.io-client';

// Define isDevelopment
// const isDevelopment = import.meta.env.DEV;

function App() {
  const [message, setMessage] = useState("");
  const edit = useSearchParam("edit");
  const [connected,setConnected] = useState(false)

  useEffect(() => {
    fetch("/api/hello")
      .then((response) => response.json())
      .then((data) => setMessage(data.message));
  }, []);

  useEffect(() => {
    // Connect to the current host
    const socket = io();

    socket.on('connect', () => {
      setConnected(true)
      console.log('Connected to server');
    });

    // Add more socket event listeners here

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="App">
      <div>
        <h1> {connected ? "Connected":"not"}</h1>
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
