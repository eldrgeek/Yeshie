// Main test exports for CDP testing suite
export { testCDPConnection } from './simple-cdp-connection';
export { checkExtensionSimple } from './extension-verification';
export { runLogTestingWorkflow } from './log-testing-workflow';

// Type exports
export * from '../types/cdp-types';

// Test runner utility
import { testCDPConnection } from './simple-cdp-connection';
import { checkExtensionSimple } from './extension-verification';
import { runLogTestingWorkflow } from './log-testing-workflow';
import { TestResult } from '../types/cdp-types';

export interface TestSuite {
  name: string;
  description: string;
  testFunction: () => Promise<TestResult>;
}

export const allTests: TestSuite[] = [
  {
    name: 'cdp-connection',
    description: 'Test Chrome DevTools Protocol connection',
    testFunction: testCDPConnection
  },
  {
    name: 'extension-verification',
    description: 'Verify Yeshie extension is loaded and functional',
    testFunction: checkExtensionSimple
  },
  {
    name: 'log-testing-workflow',
    description: 'Test log clearing, action recording, and log retrieval workflow',
    testFunction: runLogTestingWorkflow
  }
];

export async function runAllTests(): Promise<TestResult[]> {
  console.log('🧪 Running all CDP tests...\n');
  
  const results: TestResult[] = [];
  
  for (const test of allTests) {
    console.log(`\n📋 Running test: ${test.name}`);
    console.log(`📄 Description: ${test.description}`);
    console.log('─'.repeat(50));
    
    try {
      const result = await test.testFunction();
      results.push({
        ...result,
        details: {
          ...result.details,
          testName: test.name,
          testDescription: test.description
        }
      });
      
      console.log(`✅ Test ${test.name}: ${result.success ? 'PASSED' : 'FAILED'}`);
      if (!result.success) {
        console.log(`❌ Error: ${result.message}`);
      }
    } catch (error: any) {
      console.log(`❌ Test ${test.name}: FAILED with exception`);
      console.log(`   Error: ${error.message}`);
      
      results.push({
        success: false,
        message: `Test failed with exception: ${error.message}`,
        details: {
          testName: test.name,
          testDescription: test.description,
          exception: error.message
        }
      });
    }
    
    console.log('─'.repeat(50));
  }
  
  // Summary
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${results.length}`);
  
  return results;
}

export async function runTest(testName: string): Promise<TestResult> {
  const test = allTests.find(t => t.name === testName);
  
  if (!test) {
    throw new Error(`Test '${testName}' not found. Available tests: ${allTests.map(t => t.name).join(', ')}`);
  }
  
  console.log(`🧪 Running test: ${test.name}`);
  console.log(`📄 Description: ${test.description}\n`);
  
  return await test.testFunction();
} 