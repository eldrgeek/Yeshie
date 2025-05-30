#!/usr/bin/env node

import { ChromeManager } from './chrome-manager';
import { ExtensionInspector } from './extension-inspector';

const CDP = require('chrome-remote-interface');

async function manualDebugSession() {
  console.log('🐛 Yeshie Manual Debug Session');
  console.log('===============================\n');
  
  const chromeManager = new ChromeManager();
  let inspector: ExtensionInspector | null = null;
  
  try {
    // Launch Chrome with extension
    console.log('🚀 Launching Chrome with extension...');
    await chromeManager.launchChrome();
    const chromePort = chromeManager.getPort();
    
    // Get extension ID
    const extensionId = await chromeManager.getExtensionId();
    console.log(`📦 Extension loaded: ${extensionId}`);
    
    // Initialize extension inspector
    inspector = new ExtensionInspector(chromePort, extensionId);
    await inspector.setupLogging();
    await inspector.injectTestInstrumentation();
    
    // Connect to background script for additional logging
    const targets = await CDP.List({ port: chromePort });
    const backgroundTarget = targets.find((target: any) => 
      target.url.includes(extensionId) && target.url.includes('background')
    );
    
    if (backgroundTarget) {
      const backgroundClient = await CDP({ target: backgroundTarget });
      await backgroundClient.Runtime.enable();
      
      // Listen for console logs
      backgroundClient.Runtime.consoleAPICalled((params: any) => {
        if (params.args && params.args[0] && params.args[0].value) {
          const message = params.args[0].value;
          if (message.includes('speech') || message.includes('listen') || message.includes('transcrib')) {
            console.log('🎯 Background Speech:', message);
          }
        }
      });
      
      console.log('📡 Background script logging enabled');
    }
    
    // Connect to page for content script logging
    const pageTarget = targets.find((target: any) => target.type === 'page');
    if (pageTarget && pageTarget.webSocketDebuggerUrl) {
      const pageClient = await CDP({ target: pageTarget.webSocketDebuggerUrl });
      await pageClient.Runtime.enable();
      
      pageClient.Runtime.consoleAPICalled((params: any) => {
        if (params.args && params.args[0] && params.args[0].value) {
          const message = params.args[0].value;
          if (message.includes('speech') || message.includes('listen') || message.includes('transcrib') || message.includes('focus')) {
            console.log('📄 Content Speech:', message);
          }
        }
      });
      
      console.log('📄 Content script logging enabled');
    }
    
    console.log('\n🎯 MANUAL TESTING INSTRUCTIONS:');
    console.log('================================');
    console.log('1. Chrome should be open with your extension loaded');
    console.log('2. Navigate to https://github.com');
    console.log('3. Turn ON listening and transcribing'); 
    console.log('4. Switch to another tab (or open new tab)');
    console.log('5. Switch back to GitHub tab');
    console.log('6. Check if listening/transcribing is still ON');
    console.log('7. Look for logs in this terminal');
    console.log('8. Press Ctrl+C when done\n');
    
    console.log('💡 Chrome DevTools tips:');
    console.log('- Open DevTools > Extensions tab to inspect extension');
    console.log('- Check Console for extension logs');
    console.log('- Look for SpeechEditor elements in Elements tab');
    console.log();
    
    // Keep process alive
    console.log('⏳ Waiting for manual testing... (Press Ctrl+C to exit)');
    
    // Simple way to keep process alive
    const keepAlive = () => {
      setTimeout(() => {
        console.log('🔄 Still debugging... Chrome should be open');
        keepAlive();
      }, 30000); // Log every 30 seconds
    };
    keepAlive();
    
    // Handle process termination
    const cleanup = async () => {
      console.log('\n🧹 Cleaning up...');
      await chromeManager.kill();
      console.log('✅ Cleanup completed');
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    
  } catch (error) {
    console.error('❌ Debug session failed:', error);
    await chromeManager.kill();
    process.exit(1);
  }
}

if (require.main === module) {
  manualDebugSession();
} 