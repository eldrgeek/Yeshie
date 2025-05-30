#!/usr/bin/env node

import CDP from 'chrome-remote-interface';
import { CDPClient, TestResult } from '../types/cdp-types';

export const logTestingWorkflow = {
  name: 'log-testing-workflow',
  description: 'Test log clearing, action recording, and log retrieval workflow'
};

export async function runLogTestingWorkflow(): Promise<TestResult> {
  let client: any = null;
  
  try {
    console.log('🧪 Starting Log Testing Workflow...\n');

    // Step 1: Connect to Chrome
    console.log('📍 Step 1: Connecting to Chrome DevTools Protocol...');
    client = await CDP({ port: 9222 });
    const { Runtime, Target, Page } = client;
    await Runtime.enable();
    await Page.enable();
    console.log('✅ Connected to Chrome\n');

    // Step 2: Open or find the extension control page
    console.log('📍 Step 2: Opening Yeshie extension control page...');
    
    const controlPageUrl = 'chrome-extension://jipifcbjcfiacclhfahcbefkfofkneke/tabs/index.html';
    
    // Check if the control page is already open
    const targets = await Target.getTargets();
    let controlPageTarget = targets.targetInfos?.find((target: any) => 
      target.type === 'page' && 
      target.url && 
      target.url.includes('jipifcbjcfiacclhfahcbefkfofkneke/tabs/index.html')
    );

    let pageClient: any;
    let PageRuntime: any;
    let PageInstance: any;

    if (!controlPageTarget) {
      console.log('📖 Control page not found, opening in current tab...');
      // Navigate current page to the control page instead of creating a new target
      await Page.navigate({ url: controlPageUrl });
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page to load
      console.log('✅ Navigated to control page');
      
      // Use the current client for the control page
      pageClient = client;
      PageRuntime = Runtime;
      PageInstance = Page;
    } else {
      console.log('📖 Found existing control page');
      console.log(`✅ Control page target ID: ${controlPageTarget.id}\n`);

      // Step 3: Connect to the control page
      console.log('📍 Step 3: Connecting to control page...');
      pageClient = await CDP({ target: controlPageTarget.id, port: 9222 });
      PageRuntime = pageClient.Runtime;
      PageInstance = pageClient.Page;
      await PageRuntime.enable();
      await PageInstance.enable();
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('✅ Connected to control page\n');
    }

    // Step 4: Clear existing logs
    console.log('📍 Step 4: Clearing existing logs...');
    await PageRuntime.evaluate({
      expression: `
        (async () => {
          try {
            await chrome.storage.local.remove('yeshieSessionLogs');
            console.log('✅ Logs cleared successfully');
            return { success: true, message: 'Logs cleared' };
          } catch (error) {
            console.error('❌ Failed to clear logs:', error);
            return { success: false, error: error.message };
          }
        })()
      `,
      awaitPromise: true
    });

    console.log('✅ Logs cleared successfully!\n');

    // Step 5: Wait for user action
    console.log('🎯 **READY FOR ACTION!**');
    console.log('📋 Please perform your actions now...');
    console.log('⏳ When finished, press ENTER in the terminal to analyze what you did...\n');
    
    // Wait for user to press enter
    await new Promise<void>((resolve) => {
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      
      const onData = (key: string) => {
        if (key === '\r' || key === '\n') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          resolve();
        }
      };
      
      stdin.on('data', onData);
    });

    console.log('\n📍 Step 6: Analyzing what you did...');

    // Step 6: Read new logs and analyze actions
    await new Promise(resolve => setTimeout(resolve, 1000)); // Brief wait for any final logs
    
    const logsResult = await PageRuntime.evaluate({
      expression: `
        (async () => {
          try {
            const result = await chrome.storage.local.get('yeshieSessionLogs');
            const logs = result.yeshieSessionLogs || [];
            return {
              success: true,
              logCount: logs.length,
              logs: logs,
              allLogs: logs
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    if (!logsResult.result?.value?.success) {
      console.log('❌ Failed to read logs:', logsResult.result?.value?.error);
      await pageClient.close();
      return {
        success: false,
        message: `Failed to read logs: ${logsResult.result?.value?.error}`
      };
    }

    const logData = logsResult.result.value;
    console.log(`📊 Found ${logData.logCount} new log entries from your actions\n`);

    if (logData.logs && logData.logs.length > 0) {
      console.log('🔍 **ANALYSIS OF YOUR ACTIONS:**\n');

      // Group logs by feature and analyze patterns
      const logsByFeature = logData.logs.reduce((acc: any, log: any) => {
        const feature = log.feature || 'unknown';
        if (!acc[feature]) acc[feature] = [];
        acc[feature].push(log);
        return acc;
      }, {});

      const logsByLevel = logData.logs.reduce((acc: any, log: any) => {
        acc[log.level || 'unknown'] = (acc[log.level || 'unknown'] || 0) + 1;
        return acc;
      }, {});

      // Analyze action patterns
      let actionSummary: string[] = [];
      
      if (logsByFeature.Background) {
        const bgLogs = logsByFeature.Background;
        const tabMessages = bgLogs.filter((log: any) => log.message?.includes('tab') || log.message?.includes('Tab'));
        if (tabMessages.length > 0) {
          actionSummary.push(`🔄 **Tab Activity**: ${tabMessages.length} tab-related operations detected`);
        }
      }

      if (logsByFeature.UI) {
        const uiLogs = logsByFeature.UI;
        actionSummary.push(`🖱️  **UI Interactions**: ${uiLogs.length} interface operations`);
      }

      if (logsByFeature.Stepper) {
        const stepperLogs = logsByFeature.Stepper;
        actionSummary.push(`🤖 **Automation Activity**: ${stepperLogs.length} stepper operations`);
      }

      if (logsByFeature.Recording) {
        const recordingLogs = logsByFeature.Recording;
        actionSummary.push(`📹 **Recording Activity**: ${recordingLogs.length} recording operations`);
      }

      if (logsByFeature.Storage) {
        const storageLogs = logsByFeature.Storage;
        actionSummary.push(`💾 **Data Operations**: ${storageLogs.length} storage operations`);
      }

      if (actionSummary.length === 0) {
        actionSummary.push('🤔 **Background Activity**: Mostly background processing detected');
      }

      console.log('📋 **WHAT YOU DID:**');
      actionSummary.forEach(summary => console.log(`   ${summary}`));

      console.log('\n📝 **DETAILED LOG TIMELINE:**');
      logData.logs.forEach((log: any, i: number) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        console.log(`   ${i + 1}. [${time}] [${log.level?.toUpperCase()}] ${log.feature}: ${log.message}`);
        if (log.context && Object.keys(log.context).length > 0) {
          console.log(`      Context: ${JSON.stringify(log.context)}`);
        }
      });

      console.log('\n📊 **STATISTICS:**');
      console.log(`   Total Actions: ${logData.logCount}`);
      console.log(`   By Level: ${JSON.stringify(logsByLevel)}`);
      console.log(`   By Feature: ${JSON.stringify(Object.keys(logsByFeature).reduce((acc: any, key) => {
        acc[key] = logsByFeature[key].length;
        return acc;
      }, {}))}`);

      // Clean up
      await pageClient.close();
      
      console.log('\n🎉 Action analysis completed!');
      
      return {
        success: true,
        message: `Analyzed ${logData.logCount} actions you performed!`,
        details: {
          totalLogs: logData.logCount,
          logsByLevel,
          logsByFeature: Object.keys(logsByFeature).reduce((acc: any, key) => {
            acc[key] = logsByFeature[key].length;
            return acc;
          }, {}),
          actionSummary,
          timeline: logData.logs.map((log: any) => ({
            time: log.timestamp,
            level: log.level,
            feature: log.feature,
            message: log.message
          }))
        }
      };
    } else {
      console.log('🤷 **NO ACTIONS DETECTED**');
      console.log('   No new logs were generated during the monitoring period.');
      console.log('   This could mean:');
      console.log('   - You didn\'t perform any actions that trigger logging');
      console.log('   - The logging features you used are disabled');
      console.log('   - The actions were too quick or didn\'t involve the extension');

      await pageClient.close();
      
      return {
        success: true,
        message: 'No actions were detected in the logs',
        details: {
          totalLogs: 0,
          hasLogs: false,
          note: 'No extension activity was logged during the monitoring period'
        }
      };
    }

  } catch (error: any) {
    console.error('❌ Log Testing Workflow failed:', error.message);
    return {
      success: false,
      message: error.message
    };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
}

// Add a new function for analyzing logs without waiting
export async function runLogAnalysis(): Promise<TestResult> {
  let client: any = null;
  
  try {
    console.log('🧪 Starting Log Analysis...\n');

    // Step 1: Connect to Chrome
    console.log('📍 Step 1: Connecting to Chrome DevTools Protocol...');
    client = await CDP({ port: 9222 });
    const { Runtime, Target, Page } = client;
    await Runtime.enable();
    await Page.enable();
    console.log('✅ Connected to Chrome\n');

    // Step 2: Find the Yeshie service worker
    console.log('📍 Step 2: Finding Yeshie service worker...');
    
    // Get all targets
    const targets = await Target.getTargets();
    let serviceWorkerTarget = targets.targetInfos?.find((target: any) => 
      target.type === 'service_worker' && 
      target.url && 
      target.url.includes('chrome-extension://jipifcbjcfiacclhfahcbefkfofkneke')
    );

    if (!serviceWorkerTarget) {
      console.log('❌ Yeshie service worker not found');
      return {
        success: false,
        message: 'Yeshie service worker not found. Make sure the extension is loaded.'
      };
    }

    console.log('📖 Found Yeshie service worker');
    console.log(`✅ Service worker target ID: ${serviceWorkerTarget.id}`);
    console.log(`📄 Service worker URL: ${serviceWorkerTarget.url}\n`);

    // Step 3: Connect to the service worker
    console.log('📍 Step 3: Connecting to Yeshie service worker...');
    const swClient = await CDP({ target: serviceWorkerTarget.id, port: 9222 });
    const swRuntime = swClient.Runtime;
    await swRuntime.enable();
    
    // Wait for service worker to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('✅ Connected to service worker\n');

    console.log('📍 Step 4: Analyzing current logs...');

    // First check what's available in the service worker context
    console.log('🔍 Checking service worker context...');
    const contextCheck = await swRuntime.evaluate({
      expression: `
        ({
          hasChrome: typeof chrome !== 'undefined',
          hasStorage: typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined',
          hasLocalStorage: typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined' && typeof chrome.storage.local !== 'undefined',
          chromeKeys: typeof chrome !== 'undefined' ? Object.keys(chrome).sort() : [],
          globalKeys: Object.keys(globalThis).filter(key => 
            key.toLowerCase().includes('log') || 
            key.toLowerCase().includes('yeshie') ||
            key.toLowerCase().includes('get') ||
            key.toLowerCase().includes('clear')
          ).sort(),
          hasGetLogs: typeof getLogs !== 'undefined',
          hasClearLogs: typeof clearLogs !== 'undefined'
        })
      `,
      returnByValue: true
    });

    console.log('📋 Service worker context analysis:', JSON.stringify(contextCheck.result?.value, null, 2));

    // Try to access logs using different methods
    let logsResult: any = null;

    if (contextCheck.result?.value?.hasGetLogs) {
      console.log('📍 Using global getLogs function...');
      logsResult = await swRuntime.evaluate({
        expression: `
          (async () => {
            try {
              const logs = await getLogs();
              return {
                success: true,
                logCount: logs ? logs.length : 0,
                logs: logs || [],
                method: 'getLogs'
              };
            } catch (error) {
              return { success: false, error: error.message, method: 'getLogs' };
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
    } else if (contextCheck.result?.value?.hasLocalStorage) {
      console.log('📍 Using chrome.storage.local...');
      logsResult = await swRuntime.evaluate({
        expression: `
          (async () => {
            try {
              const result = await chrome.storage.local.get('yeshieSessionLogs');
              const logs = result.yeshieSessionLogs || [];
              return {
                success: true,
                logCount: logs.length,
                logs: logs,
                method: 'chrome.storage.local'
              };
            } catch (error) {
              return { success: false, error: error.message, method: 'chrome.storage.local' };
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
    } else {
      console.log('❌ No suitable method found to access logs');
      await swClient.close();
      return {
        success: false,
        message: 'No suitable method found to access logs. Chrome APIs not available in service worker.',
        details: contextCheck.result?.value
      };
    }

    if (!logsResult.result?.value?.success) {
      console.log(`❌ Failed to read logs via ${logsResult.result?.value?.method}:`, logsResult.result?.value?.error);
      await swClient.close();
      return {
        success: false,
        message: `Failed to read logs via ${logsResult.result?.value?.method}: ${logsResult.result?.value?.error}`,
        details: {
          context: contextCheck.result?.value,
          logResult: logsResult.result?.value
        }
      };
    }

    const logData = logsResult.result.value;
    console.log(`📊 Found ${logData.logCount} log entries using ${logData.method}\n`);

    if (logData.logs && logData.logs.length > 0) {
      console.log('🔍 **ANALYSIS OF RECENT ACTIONS:**\n');

      // Group logs by feature and analyze patterns
      const logsByFeature = logData.logs.reduce((acc: any, log: any) => {
        const feature = log.feature || 'unknown';
        if (!acc[feature]) acc[feature] = [];
        acc[feature].push(log);
        return acc;
      }, {});

      const logsByLevel = logData.logs.reduce((acc: any, log: any) => {
        acc[log.level || 'unknown'] = (acc[log.level || 'unknown'] || 0) + 1;
        return acc;
      }, {});

      // Analyze action patterns
      let actionSummary: string[] = [];
      
      if (logsByFeature.Background) {
        const bgLogs = logsByFeature.Background;
        const tabMessages = bgLogs.filter((log: any) => log.message?.includes('tab') || log.message?.includes('Tab'));
        if (tabMessages.length > 0) {
          actionSummary.push(`🔄 **Tab Activity**: ${tabMessages.length} tab-related operations detected`);
        }
        
        const messageHandlers = bgLogs.filter((log: any) => log.message?.includes('message') || log.message?.includes('Message'));
        if (messageHandlers.length > 0) {
          actionSummary.push(`📨 **Message Handling**: ${messageHandlers.length} message operations`);
        }
      }

      if (logsByFeature.UI) {
        const uiLogs = logsByFeature.UI;
        actionSummary.push(`🖱️  **UI Interactions**: ${uiLogs.length} interface operations`);
      }

      if (logsByFeature.Stepper) {
        const stepperLogs = logsByFeature.Stepper;
        actionSummary.push(`🤖 **Automation Activity**: ${stepperLogs.length} stepper operations`);
      }

      if (logsByFeature.Recording) {
        const recordingLogs = logsByFeature.Recording;
        actionSummary.push(`📹 **Recording Activity**: ${recordingLogs.length} recording operations`);
      }

      if (logsByFeature.Storage) {
        const storageLogs = logsByFeature.Storage;
        actionSummary.push(`💾 **Data Operations**: ${storageLogs.length} storage operations`);
      }

      if (actionSummary.length === 0) {
        actionSummary.push('🤔 **Background Activity**: Mostly background processing detected');
      }

      console.log('📋 **WHAT HAPPENED:**');
      actionSummary.forEach(summary => console.log(`   ${summary}`));

      // Get the most recent logs to analyze timing
      const recentLogs = logData.logs.slice(-10);
      const now = new Date();
      const recentTimeframe = recentLogs.filter((log: any) => {
        const logTime = new Date(log.timestamp);
        const timeDiff = now.getTime() - logTime.getTime();
        return timeDiff < 60000; // Last minute
      });

      if (recentTimeframe.length > 0) {
        console.log(`\n🕐 **RECENT ACTIVITY** (last minute): ${recentTimeframe.length} actions`);
      }

      console.log('\n📝 **DETAILED LOG TIMELINE:**');
      logData.logs.slice(-15).forEach((log: any, i: number) => {
        const time = new Date(log.timestamp).toLocaleTimeString();
        console.log(`   ${i + 1}. [${time}] [${log.level?.toUpperCase()}] ${log.feature}: ${log.message}`);
        if (log.context && Object.keys(log.context).length > 0) {
          console.log(`      Context: ${JSON.stringify(log.context)}`);
        }
      });

      console.log('\n📊 **STATISTICS:**');
      console.log(`   Total Log Entries: ${logData.logCount}`);
      console.log(`   Recent Actions (last minute): ${recentTimeframe.length}`);
      console.log(`   By Level: ${JSON.stringify(logsByLevel)}`);
      console.log(`   By Feature: ${JSON.stringify(Object.keys(logsByFeature).reduce((acc: any, key) => {
        acc[key] = logsByFeature[key].length;
        return acc;
      }, {}))}`);

      // Clean up
      await swClient.close();
      
      console.log('\n🎉 Log analysis completed!');
      
      return {
        success: true,
        message: `Analyzed ${logData.logCount} log entries! Recent activity: ${recentTimeframe.length} actions in the last minute.`,
        details: {
          totalLogs: logData.logCount,
          recentActions: recentTimeframe.length,
          logsByLevel,
          logsByFeature: Object.keys(logsByFeature).reduce((acc: any, key) => {
            acc[key] = logsByFeature[key].length;
            return acc;
          }, {}),
          actionSummary,
          timeline: logData.logs.slice(-10).map((log: any) => ({
            time: log.timestamp,
            level: log.level,
            feature: log.feature,
            message: log.message
          }))
        }
      };
    } else {
      console.log('🤷 **NO RECENT ACTIONS DETECTED**');
      console.log('   No logs were found in the extension storage.');
      console.log('   This could mean:');
      console.log('   - No actions were performed that trigger logging');
      console.log('   - The logging features are disabled');
      console.log('   - The logs were recently cleared');

      await swClient.close();
      
      return {
        success: true,
        message: 'No recent actions were detected in the logs',
        details: {
          totalLogs: 0,
          hasLogs: false,
          note: 'No extension activity was logged'
        }
      };
    }

  } catch (error: any) {
    console.error('❌ Log Analysis failed:', error.message);
    return {
      success: false,
      message: error.message
    };
  } finally {
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // Ignore close errors
      }
    }
  }
} 