import { IStorageProvider } from '@yeshie/shared';

export class SessionStorageAdapter implements IStorageProvider {
  getItem(key: string): string | null {
    return sessionStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    sessionStorage.setItem(key, value);
  }
} 