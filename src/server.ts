
import serverSetup from './plugins/serverSetup';
import { SessionManager }   from './plugins/sessionManager';
import messageForwarder from './plugins/messageForwarder';
import collaborativeEditor from './plugins/collaborativeEditing';
import monitorCommunicator from './plugins/monitorCommunication';
import errorLogger from './plugins/errorLogger';
// Apply plugins
const io = serverSetup();
const sm = new SessionManager(io);
messageForwarder(sm);
collaborativeEditor(sm);
monitorCommunicator(sm);
errorLogger();

// Start the server
