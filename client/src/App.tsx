import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/hello')
      .then(response => response.json())
      .then(data => setMessage(data.message))
  }, [])

  return (
    <div className="App">
      <h1>Vite + React</h1>
      <p>Message given from server: {message}</p>
    </div>
  )
}

export default App
