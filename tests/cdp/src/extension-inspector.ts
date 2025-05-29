import { TestContext, LogEntry, ErrorEntry } from './types';

// Use require to avoid TypeScript module resolution issues
const CDP = require('chrome-remote-interface');

export class ExtensionInspector {
  private cdpPort: number;
  private extensionId: string;
  private logs: LogEntry[] = [];
  private errors: ErrorEntry[] = [];

  constructor(cdpPort: number, extensionId: string) {
    this.cdpPort = cdpPort;
    this.extensionId = extensionId;
  }

  async setupLogging(): Promise<void> {
    console.log('📝 Setting up extension logging...');
    
    // Connect to background script
    const targets = await CDP.List({ port: this.cdpPort });
    const backgroundTarget = targets.find((target: any) => 
      target.url.includes(this.extensionId) && target.url.includes('background')
    );

    if (backgroundTarget) {
      console.log('🎯 Connecting to background script...');
      const backgroundClient = await CDP({ target: backgroundTarget, port: this.cdpPort });
      await backgroundClient.Runtime.enable();
      
      backgroundClient.Runtime.consoleAPICalled((params: any) => {
        this.logs.push({
          timestamp: Date.now(),
          level: params.type,
          source: 'background',
          message: params.args.map((arg: any) => this.formatConsoleArg(arg)).join(' '),
          args: params.args
        });
        console.log(`[BG] ${params.type}: ${params.args.map((arg: any) => this.formatConsoleArg(arg)).join(' ')}`);
      });

      backgroundClient.Runtime.exceptionThrown((params: any) => {
        this.errors.push({
          timestamp: Date.now(),
          source: 'background',
          message: params.exceptionDetails.text || 'Unknown error',
          stack: params.exceptionDetails.stackTrace?.callFrames?.map((frame: any) => 
            `${frame.functionName} (${frame.url}:${frame.lineNumber}:${frame.columnNumber})`
          ).join('\n')
        });
        console.log(`[BG ERROR] ${params.exceptionDetails.text}`);
      });
    }

    // Monitor content scripts in tabs
    const contentTargets = targets.filter((target: any) => target.type === 'page');
    console.log(`📄 Found ${contentTargets.length} page targets`);
    
    for (const target of contentTargets) {
      try {
        const contentClient = await CDP({ target, port: this.cdpPort });
        await contentClient.Runtime.enable();
        
        contentClient.Runtime.consoleAPICalled((params: any) => {
          // Filter for extension-related logs
          const message = params.args.map((arg: any) => this.formatConsoleArg(arg)).join(' ');
          if (message.includes('yeshie') || message.includes('Yeshie') || message.includes('YESHIE_TEST') || message.includes('speech')) {
            this.logs.push({
              timestamp: Date.now(),
              level: params.type,
              source: 'content',
              message,
              args: params.args
            });
            console.log(`[CONTENT] ${params.type}: ${message}`);
          }
        });
      } catch (error) {
        console.warn(`⚠️ Could not connect to content target: ${target.url}`);
      }
    }
  }

  private formatConsoleArg(arg: any): string {
    switch (arg.type) {
      case 'string':
        return arg.value;
      case 'object':
        return JSON.stringify(arg.preview?.properties || {});
      case 'undefined':
        return 'undefined';
      case 'function':
        return '[Function]';
      default:
        return String(arg.value || arg.description || arg.type);
    }
  }

  async getExtensionStorage(): Promise<any> {
    try {
      const targets = await CDP.List({ port: this.cdpPort });
      const backgroundTarget = targets.find((target: any) => 
        target.url.includes(this.extensionId) && target.url.includes('background')
      );

      if (!backgroundTarget) return {};

      const client = await CDP({ target: backgroundTarget, port: this.cdpPort });
      await client.Runtime.enable();

      // Execute script to get chrome.storage.local contents
      const result = await client.Runtime.evaluate({
        expression: `
          new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
              resolve(items);
            });
          })
        `,
        awaitPromise: true
      });

      return result.result.value || {};
    } catch (error) {
      console.warn('⚠️ Could not retrieve extension storage:', error);
      return {};
    }
  }

  async injectTestInstrumentation(): Promise<void> {
    console.log('🔧 Injecting test instrumentation...');
    
    const targets = await CDP.List({ port: this.cdpPort });
    const backgroundTarget = targets.find((target: any) => 
      target.url.includes(this.extensionId) && target.url.includes('background')
    );

    if (!backgroundTarget) return;

    const client = await CDP({ target: backgroundTarget, port: this.cdpPort });
    await client.Runtime.enable();

    // Inject logging for chrome.runtime.sendMessage
    await client.Runtime.evaluate({
      expression: `
        if (!window._yeshieTestInstrumentation) {
          window._yeshieTestInstrumentation = true;
          
          const originalSendMessage = chrome.runtime.sendMessage;
          chrome.runtime.sendMessage = function(...args) {
            console.log('[YESHIE_TEST] Message sent:', JSON.stringify(args[0]));
            return originalSendMessage.apply(this, args);
          };
          
          const originalOnMessage = chrome.runtime.onMessage;
          if (originalOnMessage && originalOnMessage.addListener) {
            const originalAddListener = originalOnMessage.addListener;
            originalOnMessage.addListener = function(callback) {
              const wrappedCallback = function(message, sender, sendResponse) {
                console.log('[YESHIE_TEST] Message received:', JSON.stringify(message));
                return callback(message, sender, sendResponse);
              };
              return originalAddListener.call(this, wrappedCallback);
            };
          }
          
          console.log('[YESHIE_TEST] Instrumentation injected successfully');
        }
      `
    });
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getErrors(): ErrorEntry[] {
    return [...this.errors];
  }

  clearLogs(): void {
    this.logs = [];
    this.errors = [];
  }
} 