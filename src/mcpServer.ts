import express from 'express';
import { Server } from 'socket.io';
import { createServer } from 'http';

export function startMCPServer(port = 8123) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  io.on('connection', (socket) => {
    socket.on('mcp:message', (msg) => {
      io.emit('mcp:message', msg);
    });

    socket.on('profile:tabs', (data) => {
      io.emit('profile:tabs', data);
    });
  });

  httpServer.listen(port, () => {
    console.log(`MCP server listening on ${port}`);
  });
}

if (require.main === module) {
  startMCPServer();
}
