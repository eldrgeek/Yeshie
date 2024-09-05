import { useState, useEffect } from "react";
import "./App.css";
import { useSearchParam } from "react-use";

function App() {
  const [message, setMessage] = useState("");
  const edit = useSearchParam("edit");

  useEffect(() => {
    fetch("/api/hello")
      .then((response) => response.json())
      .then((data) => setMessage(data.message));
  }, []);

  return (
    <div className="App">
      <div>
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
