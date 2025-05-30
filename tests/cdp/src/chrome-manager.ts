import * as path from 'path';
import * as fs from 'fs';

// Use require to avoid TypeScript module resolution issues
const chromeLauncher = require('chrome-launcher');
const CDP = require('chrome-remote-interface');

export class ChromeManager {
  private chrome: any;
  private extensionPath: string;
  private persistentProfilePath: string;
  
  constructor() {
    this.extensionPath = path.resolve(__dirname, '../../../extension/build/chrome-mv3-dev');
    this.persistentProfilePath = path.join(__dirname, '../persistent-chrome-profile');
  }

  async launchChrome(): Promise<void> {
    // Check if extension build exists
    if (!fs.existsSync(this.extensionPath)) {
      throw new Error(`Extension build not found at: ${this.extensionPath}. Run 'cd extension && pnpm run build' first.`);
    }

    console.log('🚀 Launching Chrome with extension...');
    console.log(`📁 Extension path: ${this.extensionPath}`);
    console.log(`👤 Profile path: ${this.persistentProfilePath}`);
    
    // Ensure persistent profile directory exists
    if (!fs.existsSync(this.persistentProfilePath)) {
      fs.mkdirSync(this.persistentProfilePath, { recursive: true });
      console.log('📁 Created persistent Chrome profile directory');
    }
    
    try {
      this.chrome = await chromeLauncher.launch({
        chromeFlags: [
          '--load-extension=' + this.extensionPath,
          '--disable-extensions-except=' + this.extensionPath,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-popup-blocking',
          '--disable-translate',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-ipc-flooding-protection',
          '--disable-features=VizDisplayCompositor',
          '--disable-features=MediaRouter',
          '--disable-infobars',
          '--disable-extensions-file-access-check',
          '--disable-extensions-http-throttling',
          '--allow-running-insecure-content',
          '--disable-web-security',
          '--disable-component-extensions-with-background-pages',
          '--window-size=1200,800',
          '--user-data-dir=' + this.persistentProfilePath
        ],
        logLevel: 'error',
        connectionPollInterval: 500,
        maxConnectionRetries: 50
      });

      console.log(`✅ Chrome launched on debugging port ${this.chrome.port}`);
      
      // Wait a bit for Chrome to fully initialize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Test connection
      await this.testConnection();
      
    } catch (error) {
      console.error('❌ Failed to launch Chrome:', error);
      throw new Error(`Chrome launch failed: ${error}`);
    }
  }

  private async testConnection(): Promise<void> {
    try {
      console.log('🔌 Testing CDP connection...');
      const targets = await CDP.List({ port: this.chrome.port });
      console.log(`✅ CDP connection successful, found ${targets.length} targets`);
    } catch (error) {
      console.error('❌ CDP connection failed:', error);
      throw new Error(`CDP connection failed: ${error}`);
    }
  }

  async getExtensionId(): Promise<string> {
    const targets = await CDP.List({ port: this.chrome.port });
    console.log('🔍 Available targets:', targets.map((t: any) => ({ type: t.type, url: t.url })));
    
    const extensionTarget = targets.find((target: any) => 
      target.url.startsWith('chrome-extension://') && 
      target.url.includes('background')
    );

    if (!extensionTarget) {
      console.error('❌ Extension targets found:', targets.filter((t: any) => t.url.includes('chrome-extension')));
      throw new Error('Extension background page not found');
    }

    const extensionId = extensionTarget.url.split('/')[2];
    console.log(`📦 Found extension ID: ${extensionId}`);
    return extensionId;
  }

  async connectToCDP(): Promise<any> {
    console.log('🔌 Connecting to CDP...');
    const client = await CDP({ port: this.chrome.port });
    
    try {
      await client.Runtime.enable();
      console.log('✅ Runtime domain enabled');
    } catch (error: any) {
      console.warn('⚠️ Runtime domain not available:', error.message);
    }

    try {
      await client.Page.enable();
      console.log('✅ Page domain enabled');
    } catch (error: any) {
      console.warn('⚠️ Page domain not available:', error.message);
    }

    try {
      await client.Network.enable();
      console.log('✅ Network domain enabled');
    } catch (error: any) {
      console.warn('⚠️ Network domain not available:', error.message);
    }

    // Target domain might not be available in all contexts
    try {
      if (client.Target && typeof client.Target.enable === 'function') {
        await client.Target.enable();
        console.log('✅ Target domain enabled');
      } else {
        console.log('ℹ️ Target domain not available in this context');
      }
    } catch (error: any) {
      console.warn('⚠️ Target domain not available:', error.message);
    }
    
    console.log('✅ CDP connected');
    return client;
  }

  async kill(): Promise<void> {
    if (this.chrome) {
      await this.chrome.kill();
      console.log('🔄 Chrome instance killed');
      
      // Don't delete the persistent profile - keep it for next run
      console.log('💾 Persistent Chrome profile preserved for next run');
      console.log(`📁 Profile location: ${this.persistentProfilePath}`);
      
      // Only clean up any old temporary profiles that might exist
      try {
        const { execSync } = require('child_process');
        const tempProfilePattern = path.join(__dirname, '../temp-chrome-profile-*');
        execSync(`rm -rf ${tempProfilePattern}`, { stdio: 'ignore' });
        console.log('🧹 Old temporary Chrome profiles cleaned up');
      } catch (error) {
        // Ignore errors from cleaning up temp profiles
      }
    }
  }

  getPort(): number {
    return this.chrome?.port || 0;
  }
} 