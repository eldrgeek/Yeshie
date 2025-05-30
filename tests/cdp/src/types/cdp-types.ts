// Chrome DevTools Protocol Type Definitions
export interface CDPTarget {
  id: string;
  type: 'page' | 'service_worker' | 'background_page' | 'other';
  title?: string;
  url: string;
  webSocketDebuggerUrl?: string;
  devtoolsFrontendUrl?: string;
}

export interface CDPTargetsResponse {
  targetInfos?: CDPTarget[];
  targets?: CDPTarget[];
}

export interface CDPClient {
  Target: {
    getTargets(): Promise<CDPTargetsResponse>;
    enable(): Promise<void>;
    createTarget(params: { url: string }): Promise<{ targetId: string }>;
  };
  Runtime: {
    enable(): Promise<void>;
    evaluate(params: RuntimeEvaluateParams): Promise<RuntimeEvaluateResponse>;
  };
  Page: {
    enable(): Promise<void>;
    navigate(params: { url: string }): Promise<void>;
    loadEventFired(): Promise<void>;
  };
  close(): Promise<void>;
}

export interface RuntimeEvaluateParams {
  expression: string;
  awaitPromise?: boolean;
  timeout?: number;
  returnByValue?: boolean;
}

export interface RuntimeEvaluateResponse {
  result: {
    type: string;
    value: any;
    description?: string;
  };
  exceptionDetails?: {
    text: string;
    exception?: any;
  };
}

export interface CDPConnectionConfig {
  host?: string;
  port?: number;
  target?: string;
}

export interface ExtensionInfo {
  id: string;
  url: string;
  title?: string;
  type: string;
}

export interface LoginCheckResult {
  isLoggedIn: boolean;
  username?: string;
  avatarPresent: boolean;
  url: string;
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
} 