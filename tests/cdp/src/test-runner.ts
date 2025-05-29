import { ChromeManager } from './chrome-manager';
import { ExtensionInspector } from './extension-inspector';
import { TestResult, TestContext } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class CDPTestRunner {
  private chromeManager: ChromeManager;
  private inspector: ExtensionInspector | null = null;
  private results: TestResult[] = [];

  constructor() {
    this.chromeManager = new ChromeManager();
  }

  async initialize(): Promise<void> {
    console.log('🎯 Initializing CDP Test Runner...');
    
    await this.chromeManager.launchChrome();
    const extensionId = await this.chromeManager.getExtensionId();
    
    this.inspector = new ExtensionInspector(
      this.chromeManager.getPort(), 
      extensionId
    );
    
    await this.inspector.setupLogging();
    await this.inspector.injectTestInstrumentation();
    
    console.log('✅ CDP Test Runner initialized');
  }

  async runTest(testName: string, testFn: (context: TestContext) => Promise<void>): Promise<TestResult> {
    if (!this.inspector) {
      throw new Error('Test runner not initialized');
    }

    console.log(`\n🧪 Running test: ${testName}`);
    const startTime = Date.now();
    
    this.inspector.clearLogs();
    
    const cdp = await this.chromeManager.connectToCDP();
    const extensionId = await this.chromeManager.getExtensionId();
    
    const context: TestContext = {
      cdp,
      extensionId,
      backgroundPageTarget: null,
      logs: [],
      errors: []
    };

    try {
      await testFn(context);
      
      const duration = Date.now() - startTime;
      const logs = this.inspector.getLogs();
      const errors = this.inspector.getErrors();
      const extensionState = await this.inspector.getExtensionStorage();

      const result: TestResult = {
        testName,
        status: errors.length > 0 ? 'fail' : 'pass',
        duration,
        logs,
        errors,
        extensionState
      };

      this.results.push(result);
      console.log(`${result.status === 'pass' ? '✅' : '❌'} Test ${testName}: ${result.status} (${duration}ms)`);
      
      if (logs.length > 0) {
        console.log(`📝 Captured ${logs.length} log entries`);
      }
      
      if (errors.length > 0) {
        console.log(`⚠️ Found ${errors.length} errors`);
        errors.forEach(error => console.log(`   - ${error.message}`));
      }
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const result: TestResult = {
        testName,
        status: 'error',
        duration,
        logs: this.inspector.getLogs(),
        errors: [
          ...this.inspector.getErrors(),
          {
            timestamp: Date.now(),
            source: 'test-runner',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
          }
        ]
      };

      this.results.push(result);
      console.log(`❌ Test ${testName}: error (${duration}ms) - ${error}`);
      
      return result;
    }
  }

  async exportResults(outputPath?: string): Promise<void> {
    const resultsPath = outputPath || path.join(__dirname, '../results.json');
    const output = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'pass').length,
        failed: this.results.filter(r => r.status === 'fail').length,
        errors: this.results.filter(r => r.status === 'error').length
      },
      results: this.results
    };

    // Ensure directory exists
    const dir = path.dirname(resultsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(resultsPath, JSON.stringify(output, null, 2));
    console.log(`📄 Results exported to: ${resultsPath}`);
  }

  async cleanup(): Promise<void> {
    await this.chromeManager.kill();
    console.log('🧹 Cleanup completed');
  }

  getResults(): TestResult[] {
    return [...this.results];
  }
} 