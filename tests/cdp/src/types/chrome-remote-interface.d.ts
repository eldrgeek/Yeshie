declare module 'chrome-remote-interface' {
  interface CDPConfig {
    host?: string;
    port?: number;
    target?: string;
    protocol?: any;
  }

  interface CDPClient {
    close(): Promise<void>;
    Target: {
      getTargets(): Promise<any>;
    };
    Runtime: {
      enable(): Promise<void>;
      evaluate(params: any): Promise<any>;
    };
    Page: {
      enable(): Promise<void>;
      navigate(params: { url: string }): Promise<void>;
      loadEventFired(): Promise<void>;
    };
  }

  function CDP(config?: CDPConfig): Promise<CDPClient>;
  
  namespace CDP {
    function List(config?: CDPConfig): Promise<any[]>;
    function Version(config?: CDPConfig): Promise<any>;
  }

  export = CDP;
} 