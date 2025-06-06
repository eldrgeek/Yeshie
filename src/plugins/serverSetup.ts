import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer } from "http";
import { Server } from "socket.io";
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { logInfo } from "../utils/logger";

// Load environment variables from .env file
dotenv.config();

const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const PORT = IS_DEVELOPMENT ? 3001 : process.env.PORT || 8080;

export default function serverSetup() {
    const app = express();
    logInfo(`PORT: ${PORT}`);

    const httpServer = createServer(app);
    const clientBuildPath = path.join(__dirname, "../../client/dist");
    logInfo(`Serving static files from ${clientBuildPath}`);
    logInfo(`PROD: ${!IS_DEVELOPMENT}`);
    if (!IS_DEVELOPMENT && fs.existsSync(clientBuildPath)) {
        app.use(express.static(clientBuildPath));
    }
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
            logInfo(`Server is running on port ${PORT}`);
            if (IS_DEVELOPMENT) {
                logInfo(
                    `Vite dev server is expected to run on http://localhost:3000`,
                );
                logInfo(`Make sure to start the Vite dev server separately`);
            }
        });
        return io;
    }
