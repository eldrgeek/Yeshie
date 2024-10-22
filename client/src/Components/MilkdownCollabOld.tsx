import React, { useState } from 'react';
import { MilkdownProvider } from '@milkdown/react';
import { Crepe } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { collab, collabServiceCtx } from '@milkdown/plugin-collab';
import { WebrtcProvider } from 'y-webrtc'
// import { editorCtx } from '@milkdown/core';
import * as Y from 'yjs'

// import { Editor } from '@tiptap/react';


const markdown = `# Milkdown Editor Crepe

> This is a demo for using [Milkdown](https://milkdown.dev) editor crepe.

Let's add some content to the editor.

---
`;

const MilkdownCrepe: React.FC = () => {
  // const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  // const [provider, setProvider] = useState<WebrtcProvider | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [editor,setEditor] = useState<any>(null);
  React.useEffect(() => {
    if (containerRef.current) {
      let crepe = new Crepe({
        root: containerRef.current,
        defaultValue: markdown,

      });
      crepe.editor.use(collab);
      crepe.create().then(() => {
      setEditor(crepe?.editor);
      });
    }
    
    // return () => {
    //   if (crepe) crepe.destroy();
    // };
  }, []);
  React.useEffect(() => {
    if (editor) {
      const ydoc = new Y.Doc()
      const provider = new WebrtcProvider('yeshiex', ydoc)
      editor.action((ctx:any) => {
        console.log("ACTION",ctx);
        const collabService = ctx.get(collabServiceCtx);
    
        collabService
          .bindDoc(ydoc)
          .setAwareness(provider.awareness)
          .connect();
      });
      
    }
  }, [editor]);

  return <div ref={containerRef} />;
};

const MilkdownCollab: React.FC = () => {
  return (
    <MilkdownProvider>
      <MilkdownCrepe />
    </MilkdownProvider>
  );
};

export default MilkdownCollab;
