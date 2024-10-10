import { v4 as uuidv4 } from 'uuid';
import { Server, Socket } from 'socket.io';

export interface SessionInfo {
    componentType: string;
    socket: Socket;
    sessionNo: number;
    conversationId: string | null;
    version: number;
    updates: any[];
}

export class SessionManager {
    public sessions: Map<string, SessionInfo>; // Declare sessions property
    public io: Server;
    private sessionNo: number;
    constructor(io: Server) {
        this.io = io;
        this.sessionNo = 0;
        this.sessions = new Map<string, SessionInfo>(); // Store sessions
        io.on('connection', (socket: Socket) => {
            let sessionId: string;
            socket.on('session?', (componentType: string) => {
                sessionId = uuidv4();
                socket.emit('session:', sessionId);
            });
            socket.on('session:', (sesionId: string, componentType: string) => {
                this.addSession(socket, sesionId, componentType);
            });
            socket.on('disconnect', () => {
                this.remove(sessionId);
            });
        });
    }


    remove(sessionId: string) {
        this.sessions.delete(sessionId);
    }
    addSession(socket: Socket, sessionId: string, componentType: string) {
        this.sessions.set(sessionId, {
            componentType,
            socket,
            sessionNo: this.sessionNo++,
            conversationId: null,
            version: 0,
            updates: []
        });
    }
    getSession(sessionId: string): SessionInfo | undefined {
        return this.sessions.get(sessionId);
    }
    setConversationId(sessionId: string, conversationId: string | null) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.conversationId = conversationId;
        }
    }
    

}