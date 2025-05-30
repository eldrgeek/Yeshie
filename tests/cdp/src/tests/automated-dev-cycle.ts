#!/usr/bin/env node

import CDP from 'chrome-remote-interface';
import { CDPClient, TestResult } from '../types/cdp-types';

interface LogEntry {
    timestamp: number;
    level: string;
    feature: string;
    message: string;
    data?: any;
}

interface DevCycleOptions {
    featureName: string;
    testActions: () => Promise<void>;
    expectedLogPatterns?: string[];
    timeoutMs?: number;
}

export class AutomatedDevCycle {
    private client: CDPClient | null = null;
    private pageClient: CDPClient | null = null;
    private capturedLogs: LogEntry[] = [];
    private logStartTime: number = 0;

    async connect(): Promise<void> {
        console.log('🔗 Connecting to Chrome DevTools...');
        
        try {
            this.client = await CDP({ port: 9222 }) as CDPClient;
            const { Runtime, Target, Page } = this.client;
            await Runtime.enable();
            await Page.enable();
            
            // Find or open extension control page
            const controlPageUrl = 'chrome-extension://jipifcbjcfiacclhfahcbefkfofkneke/tabs/index.html';
            const targets = await Target.getTargets();
            
            let controlPageTarget = targets.targetInfos?.find((target: any) => 
                target.type === 'page' && 
                target.url && 
                target.url.includes('jipifcbjcfiacclhfahcbefkfofkneke/tabs/index.html')
            );

            if (!controlPageTarget) {
                await Page.navigate({ url: controlPageUrl });
                await this.wait(3000);
                this.pageClient = this.client;
            } else {
                this.pageClient = await CDP({ target: controlPageTarget.id, port: 9222 }) as CDPClient;
                await this.pageClient.Runtime.enable();
                await this.pageClient.Page.enable();
                await this.wait(2000);
            }
            
            console.log('✅ Connected to Chrome and extension page');
        } catch (error) {
            throw new Error(`Failed to connect to Chrome: ${error}`);
        }
    }

    async clearLogs(): Promise<void> {
        if (!this.pageClient) throw new Error('Not connected');
        
        console.log('🧹 Clearing existing logs...');
        
        const result = await this.pageClient.Runtime.evaluate({
            expression: `
                (async () => {
                    try {
                        await chrome.storage.local.remove('yeshieSessionLogs');
                        console.log('[DevCycle] 🧹 Logs cleared for new test cycle');
                        return { success: true };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                })()
            `,
            awaitPromise: true,
            returnByValue: true
        });

        if (!result.result?.value?.success) {
            throw new Error(`Failed to clear logs: ${result.result?.value?.error}`);
        }
        
        // Reset our captured logs and start time
        this.capturedLogs = [];
        this.logStartTime = Date.now();
        
        console.log('✅ Logs cleared successfully');
    }

    async runFeatureTest(options: DevCycleOptions): Promise<TestResult> {
        const { featureName, testActions, expectedLogPatterns = [], timeoutMs = 30000 } = options;
        
        console.log(`\n🧪 Running automated dev cycle for: ${featureName}`);
        console.log('=' .repeat(50));
        
        try {
            // Step 1: Clear logs
            await this.clearLogs();
            
            // Step 2: Start log monitoring
            await this.startLogMonitoring();
            
            // Step 3: Run the test actions
            console.log(`\n🎯 Executing test actions for ${featureName}...`);
            await testActions();
            
            // Step 4: Wait for logs to settle
            await this.wait(2000);
            
            // Step 5: Capture and analyze logs
            const logs = await this.captureLogs();
            const analysis = await this.analyzeLogs(logs, expectedLogPatterns);
            
            console.log(`\n📊 Test cycle completed for ${featureName}`);
            console.log(`📋 Captured ${logs.length} log entries`);
            
            return {
                success: analysis.success,
                message: analysis.summary,
                details: {
                    featureName,
                    logCount: logs.length,
                    capturedLogs: logs,
                    analysis: analysis,
                    expectedPatterns: expectedLogPatterns
                }
            };
            
        } catch (error) {
            return {
                success: false,
                message: `Dev cycle failed: ${error}`,
                details: { featureName, error: String(error) }
            };
        }
    }

    private async startLogMonitoring(): Promise<void> {
        if (!this.client) throw new Error('Not connected');
        
        const { Runtime } = this.client;
        
        // Set up console message listener for real-time capture
        (Runtime as any).consoleAPICalled((params: any) => {
            const text = params.args.map((arg: any) => arg.value || arg.description || '').join(' ');
            
            // Filter for Yeshie-related logs
            if (this.isYeshieLog(text)) {
                this.capturedLogs.push({
                    timestamp: Date.now(),
                    level: params.type,
                    feature: this.extractFeature(text),
                    message: text
                });
            }
        });
    }

    private isYeshieLog(text: string): boolean {
        return Boolean(text && (
            text.includes('Yeshie') || 
            text.includes('[Logger]') ||
            text.includes('[DevCycle]') ||
            text.includes('speechGlobalState') ||
            text.includes('ExtComms') ||
            text.includes('bridge function') ||
            text.includes('🔧') ||
            text.includes('✅') ||
            text.includes('❌') ||
            text.includes('🎯') ||
            text.includes('📋')
        ));
    }

    private extractFeature(logText: string): string {
        if (logText.includes('speechGlobalState') || logText.includes('speech')) return 'Speech';
        if (logText.includes('ExtComms') || logText.includes('message')) return 'Messaging';
        if (logText.includes('Stepper') || logText.includes('automation')) return 'Stepper';
        if (logText.includes('Tab') || logText.includes('tab')) return 'TabManagement';
        if (logText.includes('Storage') || logText.includes('storage')) return 'Storage';
        if (logText.includes('[Logger]')) return 'Logging';
        if (logText.includes('[DevCycle]')) return 'DevCycle';
        return 'General';
    }

    private async captureLogs(): Promise<LogEntry[]> {
        if (!this.pageClient) throw new Error('Not connected');
        
        // Get stored logs from extension storage
        const result = await this.pageClient.Runtime.evaluate({
            expression: `
                (async () => {
                    try {
                        const result = await chrome.storage.local.get('yeshieSessionLogs');
                        const logs = result.yeshieSessionLogs || [];
                        return { success: true, logs };
                    } catch (error) {
                        return { success: false, error: error.message };
                    }
                })()
            `,
            awaitPromise: true,
            returnByValue: true
        });

        if (result.result?.value?.success) {
            const storedLogs = result.result.value.logs || [];
            
            // Combine stored logs with our real-time captured logs
            const allLogs = [
                ...storedLogs.filter((log: any) => log.timestamp >= this.logStartTime),
                ...this.capturedLogs
            ];
            
            // Remove duplicates and sort by timestamp
            const uniqueLogs = allLogs.reduce((acc: LogEntry[], log: LogEntry) => {
                if (!acc.some(existing => existing.timestamp === log.timestamp && existing.message === log.message)) {
                    acc.push(log);
                }
                return acc;
            }, []);
            
            return uniqueLogs.sort((a: LogEntry, b: LogEntry) => a.timestamp - b.timestamp);
        }
        
        return this.capturedLogs;
    }

    private async analyzeLogs(logs: LogEntry[], expectedPatterns: string[]): Promise<any> {
        console.log('\n🔍 Analyzing captured logs...');
        
        const analysis = {
            success: true,
            summary: '',
            details: {
                totalLogs: logs.length,
                byFeature: {} as Record<string, number>,
                byLevel: {} as Record<string, number>,
                patternMatches: {} as Record<string, boolean>,
                issues: [] as string[]
            }
        };

        // Group by feature and level
        logs.forEach(log => {
            analysis.details.byFeature[log.feature] = (analysis.details.byFeature[log.feature] || 0) + 1;
            analysis.details.byLevel[log.level] = (analysis.details.byLevel[log.level] || 0) + 1;
        });

        // Check expected patterns
        expectedPatterns.forEach(pattern => {
            const found = logs.some(log => log.message.includes(pattern));
            analysis.details.patternMatches[pattern] = found;
            if (!found) {
                analysis.success = false;
                analysis.details.issues.push(`Expected pattern not found: "${pattern}"`);
            }
        });

        // Look for errors
        const errorLogs = logs.filter(log => log.level === 'error');
        if (errorLogs.length > 0) {
            analysis.details.issues.push(`Found ${errorLogs.length} error(s) in logs`);
            if (expectedPatterns.length === 0) { // Only mark as failure if we're not expecting specific patterns
                analysis.success = false;
            }
        }

        // Generate summary
        const features = Object.keys(analysis.details.byFeature);
        analysis.summary = `Captured ${logs.length} logs across ${features.length} features: ${features.join(', ')}`;
        
        if (analysis.details.issues.length > 0) {
            analysis.summary += `. Issues: ${analysis.details.issues.join('; ')}`;
        }

        // Print detailed analysis
        console.log(`📊 Features active: ${features.join(', ')}`);
        console.log(`🎯 Log levels: ${Object.keys(analysis.details.byLevel).join(', ')}`);
        
        if (expectedPatterns.length > 0) {
            console.log('✅ Pattern matching:');
            Object.entries(analysis.details.patternMatches).forEach(([pattern, found]) => {
                console.log(`   ${found ? '✅' : '❌'} "${pattern}"`);
            });
        }

        if (analysis.details.issues.length > 0) {
            console.log('⚠️  Issues detected:');
            analysis.details.issues.forEach(issue => console.log(`   - ${issue}`));
        }

        return analysis;
    }

    async disconnect(): Promise<void> {
        if (this.pageClient && this.pageClient !== this.client) {
            await this.pageClient.close();
        }
        if (this.client) {
            await this.client.close();
        }
        console.log('✅ Disconnected from Chrome');
    }

    private wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Example usage functions
export async function testSpeechFeature(): Promise<TestResult> {
    const devCycle = new AutomatedDevCycle();
    
    try {
        await devCycle.connect();
        
        const result = await devCycle.runFeatureTest({
            featureName: 'Speech Recognition',
            expectedLogPatterns: [
                'speechGlobalState',
                'speech recognition',
                'microphone'
            ],
            testActions: async () => {
                // Simulate clicking speech button or activating speech
                console.log('🎤 Testing speech recognition activation...');
                // Add specific test actions here
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        });
        
        return result;
        
    } finally {
        await devCycle.disconnect();
    }
}

export async function testTabManagement(): Promise<TestResult> {
    const devCycle = new AutomatedDevCycle();
    
    try {
        await devCycle.connect();
        
        const result = await devCycle.runFeatureTest({
            featureName: 'Tab Management',
            expectedLogPatterns: [
                'tab',
                'TabList',
                'background'
            ],
            testActions: async () => {
                console.log('🔄 Testing tab operations...');
                // Add tab management test actions
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        });
        
        return result;
        
    } finally {
        await devCycle.disconnect();
    }
}

// CLI interface
if (require.main === module) {
    const testName = process.argv[2];
    
    switch (testName) {
        case 'speech':
            testSpeechFeature()
                .then(result => {
                    console.log('\n🏁 Final Result:', result);
                    process.exit(result.success ? 0 : 1);
                })
                .catch(error => {
                    console.error('❌ Test failed:', error);
                    process.exit(1);
                });
            break;
            
        case 'tabs':
            testTabManagement()
                .then(result => {
                    console.log('\n🏁 Final Result:', result);
                    process.exit(result.success ? 0 : 1);
                })
                .catch(error => {
                    console.error('❌ Test failed:', error);
                    process.exit(1);
                });
            break;
            
        default:
            console.log('Usage: node automated-dev-cycle.js <test-name>');
            console.log('Available tests: speech, tabs');
            process.exit(1);
    }
} 