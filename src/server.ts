import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { channel } from 'diagnostics_channel';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

const clientBuildPath = path.join(__dirname, '../client/dist');
const isDevelopment = process.env.NODE_ENV !== 'production';

if (!isDevelopment && fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
}

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello there from server!' });
});

if (isDevelopment) {
  app.get('/', (req, res) => {
    res.send('Server is running in development mode. Please access the React app through the Vite dev server.');
  });
} else if (fs.existsSync(path.join(clientBuildPath, 'index.html'))) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(404).send('Not found');
  });
}

interface SessionInfo {
  componentType: string;
  socket: Socket;
  sessionNo: number;
}

const sessions = new Map<string, SessionInfo>();
let sessionNo = 0;

// Create a new version of console.log
const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  // Call the original console.log
  originalConsoleLog("serv:", ...args);

  //Iterate over the sessions and send a "consoleLog" message to each socket
  sessions.forEach((sessionInfo) => {
    sessionInfo.socket.emit('serverLog', args);
  });
};

let monitorSocket: Socket | null = null;

// Add Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on("session?", (componentType) => {
    if (componentType === "monitor") {
      monitorSocket = socket;
      console.log("Monitor connected");
      // setTimeout(() => {
      //   socket.emit('calibrate', sessionId);
      // }, 1000);
    }
    const sessionId = uuidv4();
    sessions.set(sessionId, { componentType, socket, sessionNo });
    sessionNo++;
    socket.emit('session:', sessionId);
    console.log("Session created", sessionId);
    socket.emit('serverLog', [`Session created`]);
    
    // Notify all clients about the new connection
    // io.emit('client_connected', { client_id: sessionId, client_type: componentType });
  });

  socket.on('monitor', (payload) => {
    console.log("monitor", JSON.stringify(payload))
    if (monitorSocket) {
      const { op, ...data } = payload;
      monitorSocket.emit(op, data);
    } else {
      console.log("Monitor not connected");
    }
  });

 

  socket.on('session:', (sessionId, componentType) => {
    if(sessions.get(sessionId)){
      console.log("Session confirmed")
    } else {
      sessions.set(sessionId, { componentType, socket, sessionNo });
      sessionNo++;
      console.log('Session restored:', sessionId);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    // Remove the disconnected socket from the sessions Map
    for (const [sessionId, sessionInfo] of sessions.entries()) {
      if (sessionInfo.socket === socket) {
        sessions.delete(sessionId);
        console.log(`Removed session: ${sessionId}`);
        break;
      }
    }
  });

  // New event handler for forwarding messages
  socket.on('forward_message', (message) => {
    console.log('Forwarding message:', message);
    if (message.to) {
      const targetSession = sessions.get(message.to);
      if (targetSession) {
        targetSession.socket.emit(message.type, message.payload);
      } else {
        console.log(`Error: Client ${message.to} not found`);
      }
    } else {
      // Broadcast to all clients except the sender
      sessions.forEach((sessionInfo, sessionId) => {
        if (sessionInfo.socket !== socket) {
          sessionInfo.socket.emit(message.type, message.payload);
        }
      });
    }
  });
  // Add more socket event handlers here
});

// Replace app.listen with httpServer.listen
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (isDevelopment) {
    console.log(`Access the React app at http://localhost:5173`);
  }
});