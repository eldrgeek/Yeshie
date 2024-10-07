import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import logger from "./logger"
const app = express();
const httpServer = createServer(app);

const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const PORT = IS_DEVELOPMENT ? 3001 : (process.env.PORT || 8080);
interface SessionInfo {
  componentType: string;
  socket: Socket;
  sessionNo: number;
  conversationId: string | null;  // Added conversationId property
}
// Update CORS configuration to allow requests from Firebase hosting
const ALLOWED_ORIGINS = [
  'http://localhost:3000',  // Local development
  'https://yeshie-001.web.app',  // Replace with your Firebase hosting URL
  'https://yeshie-001.firebaseapp.com'  // Replace with your Firebase hosting URL
];

const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"]
  }
});

const sessions = new Map<string, SessionInfo>();
let sessionNo = 0;
let monitorSocket: Socket | null = null;

// Server setup
_setupServer();

// Socket.IO setup
_setupSocketIO();

_setupLogging();

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (IS_DEVELOPMENT) {
    console.log(`Vite dev server is expected to run on http://localhost:3000`);
    console.log(`Make sure to start the Vite dev server separately`);
  }
});

// Helper functions
function _setupServer() {
  // Remove static file serving since client is now on Firebase
  app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello there from server!' });
  });

  if (IS_DEVELOPMENT) {
    _setupDevelopmentProxy();
  }

  _setupLogging();
}

function _setupDevelopmentProxy() {
  const { createProxyMiddleware } = require('http-proxy-middleware');
  
  app.use(
    createProxyMiddleware({
      target: 'http://localhost:5173',
      changeOrigin: true,
      ws: true,
    })
  );
}

function _setupSocketIO() {
  io.on('connection', (socket) => {
    console.log('A user connected');
    
    socket.on("session?", (componentType) => _handleSessionRequest(socket, componentType));
    socket.on('session:', (sessionId, componentType) => _handleSessionConfirmation(socket, sessionId, componentType));
    socket.on('disconnect', () => _handleDisconnect(socket));
    socket.on('forward', (message) => _handleForwardMessage(socket, message));
    socket.on('monitor', (payload) => _handleMonitorMessage(payload));
    socket.on('updateConversationId', (sessionId, conversationId) => _updateConversationId(sessionId, conversationId));
  });
}

function _setupLogging() {
  const originalConsoleLog = console.log;
  console.log = (...args: any[]) => {
    originalConsoleLog("serv:", ...args);
    sessions.forEach((sessionInfo) => {
      sessionInfo.socket.emit('serverLog', args);
    });
  };
}

function _handleSessionRequest(socket: Socket, componentType: string) {
  if (componentType === "monitor") {
    monitorSocket = socket;
    console.log("Monitor connected");
  }
  const sessionId = uuidv4();
  sessions.set(sessionId, { componentType, socket, sessionNo: sessionNo++, conversationId: null });
  socket.emit('session:', sessionId);
  console.log("Session created", sessionId);
  socket.emit('serverLog', [`Session created`]);
}

function _handleSessionConfirmation(socket: Socket, sessionId: string, componentType: string) {
  if (sessions.has(sessionId)) {
    console.log("Session confirmed");
  } else {
    sessions.set(sessionId, { componentType, socket, sessionNo: sessionNo++, conversationId: null });
    console.log('Session restored:', sessionId);
  }
}

function _handleDisconnect(socket: Socket) {
  console.log('User disconnected');
  for (const [sessionId, sessionInfo] of sessions.entries()) {
    if (sessionInfo.socket === socket) {
      sessions.delete(sessionId);
      console.log(`Removed session: ${sessionId}`);
      break;
    }
  }
}

function _handleForwardMessage(socket: Socket, message: any) {
  console.log('Forwarding message:', message);
  if (message.to) {
    const targetSession = sessions.get(message.to);
    if (targetSession) {
      const { op, ...data } = message;
      targetSession.socket.emit(op, data);
    } else {
      console.log(`Error: Client ${message.to} not found`);
    }
  } else {
    sessions.forEach((sessionInfo, sessionId) => {
      if (sessionInfo.socket !== socket && sessionInfo.conversationId === message.conversationId) {
        sessionInfo.socket.emit(message.type, message.payload);
      }
    });
  }
}

function _handleMonitorMessage(payload: any) {
  console.log("monitor", JSON.stringify(payload));
  if (monitorSocket) {
    const { op, ...data } = payload;
    monitorSocket.emit(op, data);
  } else {
    console.log("Monitor not connected");
  }
}

function _updateConversationId(sessionId: string, conversationId: string | null) {
  const session = sessions.get(sessionId);
  if (session) {
    session.conversationId = conversationId;
    console.log(`Updated conversation ID for session ${sessionId}: ${conversationId}`);
  } else {
    console.log(`Error: Session ${sessionId} not found`);
  }
}