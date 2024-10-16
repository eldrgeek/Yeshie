// import { initializeApp } from 'firebase/app';
// import { getFirestore, doc, onSnapshot, updateDoc } from 'firebase/firestore';
// import { getFirestore } from 'firebase/firestore';

import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { EditorContent, useEditor } from '@tiptap/react'
import { useState, useEffect } from 'react';

import { WebrtcProvider } from 'y-webrtc'
import * as Y from 'yjs'
import { Box, Flex, Input, ChakraProvider } from '@chakra-ui/react';

// const firebaseConfig = {
//   apiKey: "AIzaSyD0Ymhc0MNoCH6Au3Ej6n9nMQJmSRTa74g",
//   authDomain: "yeshie-001.firebaseapp.com",
//   projectId: "yeshie-001",
//   storageBucket: "yeshie-001.appspot.com",
//   messagingSenderId: "163639628172",
//   appId: "1:163639628172:web:c06a8f28c71d77fccf06a9",
//   measurementId: "G-E69M97FDH3"
// };

// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app); // ts-ignore



const ydoc = new Y.Doc()
const provider = new WebrtcProvider('yeshie', ydoc)

function Editor({ roomName, userName }: { roomName: string; userName: string }) { // eslint-disable-line
  console.log('roomName', roomName);
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider,
        user: {
          name: userName,
          color: '#f783ac',
        },
      }),
      Placeholder.configure({
        placeholder:
          'Write something … It will be shared with everyone else looking at this example.',
      }),
    ],
  })

  useEffect(() => {
    if (editor) {
      const collaborationCursor = editor.extensionManager.extensions.find(
        ext => ext.name === 'collaborationCursor'
      ) as any;
      
      if (collaborationCursor && collaborationCursor.options) {
        collaborationCursor.options.user.name = userName;
      }
    }
  }, [editor, userName]);

  return <EditorContent editor={editor} />
}

function App() {
  const [roomName, setRoomName] = useState(() => sessionStorage.getItem('roomName') || 'Yeshie');
  const [userName, setUserName] = useState(() => sessionStorage.getItem('userName') || 'Mike');
  const [docName, setDocName] = useState(() => sessionStorage.getItem('docName') || 'Document');

  useEffect(() => {
    sessionStorage.setItem('roomName', roomName);
    sessionStorage.setItem('userName', userName);
    sessionStorage.setItem('docName', docName);
  }, [roomName, userName, docName]);

  return (
    <ChakraProvider>
      <Box>
        <Flex as="header" padding={4} bg="gray.100" justifyContent="center">
          <Input
            placeholder="Room Name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            width="200px"
            marginRight={2}
          />
          <Input
            placeholder="Document Name"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            width="200px"
            marginLeft={2}
          />
          <Input
            placeholder="User Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            width="200px"
            marginLeft={2}
          />
        </Flex>
        <Editor roomName={roomName} userName={userName} />
      </Box>
    </ChakraProvider>
  );
}

export default App
