import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;

const clientBuildPath = path.join(__dirname, '../client/dist');
const isDevelopment =  process.env.NODE_ENV !== 'production';

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

// Add Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });

  // Add more socket event handlers here
});

// Replace app.listen with httpServer.listen
httpServer.listen(PORT, () => {
  console.log(`Production mode Server is running on port ${PORT}`);
  if (isDevelopment) {
    console.log(`Access the React app at http://localhost:5173`);
  }
});