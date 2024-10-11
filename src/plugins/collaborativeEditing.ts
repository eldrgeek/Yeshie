import { Server, Socket } from 'socket.io';
import { Update } from '@codemirror/collab';
import { SessionInfo, SessionManager } from './sessionManager';

export default function collaborativeEditor(sm: SessionManager) {
  sm.io.on('connection', (socket: Socket) => {
    let sessionId: string;
    socket.on("session:", (newSessionId: string, componentType: string) => {
        sessionId = newSessionId;
    });
    socket.on("conversation:", (sessionId: string, conversationId: string) => {
        sm.setConversationId(sessionId, conversationId);
        
    });
    socket.on('pullUpdates', (sessionId: string, version: number, conversationId: string) => {
      const session:SessionInfo | undefined = sm.sessions.get(sessionId);
      if (session) {
        session.conversationId = conversationId;
        const updates = session.updates.slice(version - session.version);
        socket.emit('pullUpdates', updates);
      }
    });

    socket.on('pushUpdates', (sessionId: string, version: number, updates: Update[], conversationId: string) => {
      const session:SessionInfo | undefined = sm.sessions.get(sessionId);
      if (session) {
        session.version += updates.length;
        session.updates = session.updates.concat(updates);
        session.conversationId = conversationId;

        sm.sessions.forEach((otherSession, otherSessionId) => {
          if (otherSessionId !== sessionId && otherSession.conversationId === conversationId) {
            otherSession.socket.emit('receiveUpdates', conversationId, updates);
          }
        });
      }
    });
  });
}