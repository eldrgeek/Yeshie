export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'error';
  duration: number;
  logs: LogEntry[];
  errors: ErrorEntry[];
  extensionState?: any;
}

export interface LogEntry {
  timestamp: number;
  level: 'log' | 'info' | 'warn' | 'error';
  source: 'background' | 'content' | 'popup' | 'devtools';
  message: string;
  args?: any[];
}

export interface ErrorEntry {
  timestamp: number;
  source: string;
  message: string;
  stack?: string;
}

export interface CDPConnection {
  Runtime: any;
  Page: any;
  Network: any;
  Storage: any;
  Target: any;
}

export interface TestContext {
  cdp: CDPConnection;
  extensionId: string;
  backgroundPageTarget: any;
  logs: LogEntry[];
  errors: ErrorEntry[];
} 