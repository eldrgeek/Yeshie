import { Server, Socket } from 'socket.io';
import { SessionManager } from './sessionManager';

export default function monitorCommunicator(sm: SessionManager) {
  let monitorSocket: Socket | null = null;

  sm.io.on('connection', (socket: Socket) => {
    socket.on('monitor', (payload: any) => {
      if (monitorSocket) {
        const { op, ...data } = payload;
        monitorSocket.emit(op, data);
      } else {
        console.log("Monitor not connected");
      }
    });

    socket.on('session?', (componentType: string) => {
      if (componentType === "monitor") {
        monitorSocket = socket;
        console.log("Monitor connected");
      }
    });
  });
}