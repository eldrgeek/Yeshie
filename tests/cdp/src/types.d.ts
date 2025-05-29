declare module 'chrome-remote-interface' {
  interface Target {
    id: string;
    type: string;
    title: string;
    url: string;
    webSocketDebuggerUrl?: string;
  }

  interface Client {
    Runtime: any;
    Page: any;
    Network: any;
    Target: any;
    Storage: any;
    close(): Promise<void>;
  }

  interface Options {
    port?: number;
    host?: string;
    target?: Target | string | number;
  }

  function CDP(options?: Options): Promise<Client>;
  namespace CDP {
    function List(options?: { port?: number; host?: string }): Promise<Target[]>;
  }

  export = CDP;
}

declare module 'chrome-launcher' {
  interface ChromeFlags {
    chromeFlags: string[];
    logLevel?: string;
  }

  interface LaunchedChrome {
    port: number;
    kill(): Promise<void>;
  }

  function launch(options: ChromeFlags): Promise<LaunchedChrome>;
  export { launch };
} 