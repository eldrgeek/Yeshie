import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
dotenv.config();
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const PORT = IS_DEVELOPMENT ? 3001 : process.env.PORT || 8080;

export default function serverSetup() {
    const app = express();
    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        // cors: {
        //     origin: [
        //         'http://localhost:3000',
        //         'https://yeshie-001.web.app',
        //         'https://yeshie-001.firebaseapp.com'
        //     ],
        //     methods: ["GET", "POST"]
        // }
    });
    app.get("/api/hello", (req, res) => {
        res.json({ message: "Hello there from server!" });
    });

    if (IS_DEVELOPMENT) {
        app.use(
            createProxyMiddleware({
                target: "http://localhost:5173",
                changeOrigin: true,
                ws: true,
            }),
        );
    }

    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        if (IS_DEVELOPMENT) {
            console.log(
                `Vite dev server is expected to run on http://localhost:3000`,
            );
            console.log(`Make sure to start the Vite dev server separately`);
        }
    });
    return io;
}
