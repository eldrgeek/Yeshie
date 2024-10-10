import { Server, Socket } from 'socket.io';
import { SessionInfo, SessionManager } from './sessionManager';

export default function messageForwarder(sm: SessionManager) {
  sm.io.on('connection', (socket: Socket) => {
    socket.on('forward', (message: any) => {
      if (message.to) {
        const targetSession:SessionInfo | undefined = sm.sessions.get(message.to);
        if (targetSession) {
          const { op, ...data } = message;
          targetSession.socket.emit(op, data);
        } else {
          console.log(`Error: Client ${message.to} not found`);
        }
      } else {
        sm.sessions.forEach((sessionInfo, sessionId) => {
          if (sessionInfo.socket !== socket && sessionInfo.conversationId === message.conversationId) {
            sessionInfo.socket.emit(message.type, message.payload);
          }
        });
      }
    });
  });
}