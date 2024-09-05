"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const clientBuildPath = path_1.default.join(__dirname, '../client/dist');
const isDevelopment = false; // process.env.NODE_ENV !== 'production';
if (!isDevelopment && fs_1.default.existsSync(clientBuildPath)) {
    app.use(express_1.default.static(clientBuildPath));
}
app.get('/api/hello', (req, res) => {
    res.json({ message: 'Hello there from server!' });
});
if (isDevelopment) {
    app.get('/', (req, res) => {
        res.send('Server is running in development mode. Please access the React app through the Vite dev server.');
    });
}
else if (fs_1.default.existsSync(path_1.default.join(clientBuildPath, 'index.html'))) {
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(clientBuildPath, 'index.html'));
    });
}
else {
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
