import { logError } from '../utils/logger';

export default function errorLogger() {
    process.on('uncaughtException', (error) => {
      logError('Uncaught Exception:', error);
    });
  
    process.on('unhandledRejection', (reason, promise) => {
      logError('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }