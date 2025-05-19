import React, { useEffect, useRef } from 'react';
import { defaultValueCtx, Editor, rootCtx } from '@milkdown/core';
import {
  collab,
  CollabService,
  collabServiceCtx,
} from '@milkdown/plugin-collab';
import { Crepe } from '@milkdown/crepe';
import { commonmark } from '@milkdown/preset-commonmark';
import { nord } from '@milkdown/theme-nord';
import { WebsocketProvider } from 'y-websocket';
import { Doc } from 'yjs';
import '../styles/collabstyle.css';
import { logInfo, logError } from '@yeshie/shared/utils/logger';
const name = [
  'Emma',
  'Isabella',
  'Emily',
  'Madison',
  'Ava'
]
const markdown = `
# Milkdown Vanilla Collab

> You're scared of a world where you're needed.

---

Now you can play!
`;

const randomColor = () => Math.floor(Math.random() * 16777215).toString(16);

const options = name.map((x) => ({
  color: `#${randomColor()}`,
  name: x,
}));


// If in local
// export const PORT = location.port;
// export const HOST = [location.hostname, PORT].filter(Boolean).join(':');
// const wsUrl = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${HOST}/__yjs__`;

// If in stackblitz
const wsUrl = 'wss://demos.yjs.dev/ws';

class CollabManager {
  private room = 'milkdown';
  private doc!: Doc;
  private wsProvider!: WebsocketProvider;
  // doms = createArea(this.area);

  constructor(
    private collabService: CollabService,
    // private area: HTMLElement,
    private rndInt = Math.floor(Math.random() * 4)
  ) {
    // this.doms.room.textContent = this.room;
  }

  flush(template: string) {
    this.doc?.destroy();
    this.wsProvider?.destroy();

    this.doc = new Doc();
    this.wsProvider = new WebsocketProvider(
      wsUrl,
      this.room,
      this.doc,
      { connect: true }
    );
    this.wsProvider.awareness.setLocalStateField('user', options[this.rndInt]);
    this.wsProvider.on('status', (payload: { status: string }) => {
      // this.doms.status.textContent = payload.status;
    });

    this.collabService
      .bindDoc(this.doc)
      .setAwareness(this.wsProvider.awareness);
    this.wsProvider.once('sync', async (isSynced: boolean) => {
      if (isSynced) {
        this.collabService.applyTemplate(template).connect();
      }
    });
  }

  connect() {
    this.wsProvider.connect();
    this.collabService.connect();
  }

  disconnect() {
    this.collabService.disconnect();
    this.wsProvider.disconnect();
  }

  applyTemplate(template: string) {
    this.collabService
      .disconnect()
      .applyTemplate(template, () => true)
      .connect();
  }

  toggleRoom() {
    this.room = this.room === 'milkdown' ? 'milkdown-sandbox' : 'milkdown';
    // this.doms.room.textContent = this.room;

    const template = this.room === 'milkdown' ? markdown : '# Sandbox Room';
    this.disconnect();
    this.flush(template);
  }
}

export const createEditor = async (root: string, area: string) => {
  // let crepe = await new Crepe({
  //   root:  document.querySelector(root),
  //   defaultValue: markdown,

  // });
  // crepe.editor.use(collab);
  // let editor = await crepe.create()
  
  
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.querySelector(root));
      ctx.set(defaultValueCtx, markdown);
    })
    .config(nord)
    .use(commonmark)
    .use(collab)
    .create();

  editor.action((ctx) => {
    const collabService = ctx.get(collabServiceCtx);
    const collabManager = new CollabManager(
      collabService,
      // document.querySelector(area)!
    );
    collabManager.flush(markdown);

    // collabManager.doms.connectButton.onclick = () => {
    //   collabManager.connect();
    // }

    // collabManager.doms.disconnectButton.onclick = () => {
    //   collabManager.disconnect();
    // }


    // collabManager.doms.applyButton.onclick = () => {
    //   collabManager.applyTemplate(collabManager.doms.textarea.value);
    // }

    // collabManager.doms.toggleButton.onclick = () => {
    //   collabManager.toggleRoom();
    // }
  });

  return editor;
};


const MilkdownCollab: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const initializationGuard = useRef(false);

  useEffect(() => {
    if (editorRef.current && areaRef.current && !initializationGuard.current) {
      logInfo('Initializing editor');
      initializationGuard.current = true;
      createEditor('#editor', '#area')
        .then(() => {
          logInfo('Editor initialized');
        })
        .catch((error) => {
          logError('Editor initialization failed:', error);
          initializationGuard.current = false; // Reset guard on failure
        });
    }
  }, []);

  return (
    <div>
      <div id="editor" ref={editorRef}></div>
      <div id="area" ref={areaRef}></div>
    </div>
  );
};

export default MilkdownCollab;