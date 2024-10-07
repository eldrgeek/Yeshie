import { Logging } from '@google-cloud/logging';

const isDevelopment = process.env.NODE_ENV !== 'production';
console.log(`IsDevelopment ${isDevelopment}`);

class Logger {
  private cloudLogging: Logging | null = null;
  private cloudLog: any = null;
  private originalLog: typeof console.log;

  constructor() {
    this.originalLog = console.log.bind(console);
    if (!isDevelopment) {
      this.cloudLogging = new Logging();
      this.cloudLog = this.cloudLogging.log('my-custom-log');
    }
  }

  log(...args: any[]): void {
    const message = this.formatMessage(args);
    this.logMessage(message, 'INFO');
  }

  warn(...args: any[]): void {
    const message = this.formatMessage(args);
    this.logMessage(message, 'WARNING');
  }

  error(...args: any[]): void {
    const message = this.formatMessage(args);
    this.logMessage(message, 'ERROR');
  }

  private formatMessage(args: any[]): string {
    return args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
  }

  private logMessage(message: string, severity: 'INFO' | 'WARNING' | 'ERROR'): void {
    if (isDevelopment) {
      // Local development logging
      this.originalLog(`[${severity}] ${message}`);
    } else {
      // Production logging to Google Cloud
      const metadata = {
        resource: {
          type: 'gae_app',
          labels: {
            module_id: process.env.GAE_SERVICE || 'default',
            version_id: process.env.GAE_VERSION,
          },
        },
        severity: severity,
      };

      const entry = this.cloudLog.entry(metadata, message);
      this.cloudLog.write(entry).catch((error: any) => {
        console.error('Failed to write to Google Cloud Logging:', error);
      });
    }
  }
}

const logger = new Logger();

// Replace console.log, console.warn, and console.error
console.log = logger.log.bind(logger);
console.warn = logger.warn.bind(logger);
console.error = logger.error.bind(logger);

export default logger;

// Usage examples
console.log('Server started', { port: 3000 });
console.warn('This is a warning', 42, true);
console.error('An error occurred', new Error('Something went wrong'));