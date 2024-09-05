import express from 'express';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

const clientBuildPath = path.join(__dirname, '../client/dist');
const isDevelopment = false;// process.env.NODE_ENV !== 'production';

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  if (isDevelopment) {
    console.log(`Access the React app at http://localhost:5173`);
  }
});