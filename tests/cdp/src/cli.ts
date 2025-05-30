#!/usr/bin/env node

import { testCDPConnection } from './tests/simple-cdp-connection';
import { checkExtensionSimple } from './tests/extension-verification';
import { runLogTestingWorkflow, runLogAnalysis } from './tests/log-testing-workflow';

const tests = {
  'cdp-connection': {
    name: 'cdp-connection',
    description: 'Test basic CDP connection to Chrome',
    run: testCDPConnection
  },
  'extension-verification': {
    name: 'extension-verification', 
    description: 'Verify Yeshie extension is loaded and accessible',
    run: checkExtensionSimple
  },
  'log-testing-workflow': {
    name: 'log-testing-workflow',
    description: 'Test log clearing, action recording, and log retrieval workflow',
    run: runLogTestingWorkflow
  },
  'log-analysis': {
    name: 'log-analysis',
    description: 'Analyze current extension logs to see recent activity',
    run: runLogAnalysis
  }
};

async function runAllTests() {
  const results = [];
  for (const testKey of Object.keys(tests)) {
    const test = tests[testKey as keyof typeof tests];
    console.log(`🧪 Running test: ${test.name}`);
    console.log(`📄 Description: ${test.description}\n`);
    
    try {
      const result = await test.run();
      results.push({ ...result, testName: test.name });
      
      if (result.success) {
        console.log(`✅ Test "${test.name}" passed: ${result.message}\n`);
      } else {
        console.log(`❌ Test "${test.name}" failed: ${result.message}\n`);
      }
    } catch (error: any) {
      const failedResult = {
        success: false,
        message: error.message,
        testName: test.name
      };
      results.push(failedResult);
      console.log(`❌ Test "${test.name}" failed with error: ${error.message}\n`);
    }
  }
  
  console.log('\n📊 Test Summary:');
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${results.length}`);
  
  return results;
}

async function runTest(testName: string) {
  const test = tests[testName as keyof typeof tests];
  if (!test) {
    return {
      success: false,
      message: `Test "${testName}" not found. Available tests: ${Object.keys(tests).join(', ')}`
    };
  }
  
  console.log(`🧪 Running test: ${test.name}`);
  console.log(`📄 Description: ${test.description}\n`);
  
  try {
    return await test.run();
  } catch (error: any) {
    return {
      success: false,
      message: error.message
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('🧪 Yeshie CDP Test Suite\n');
    console.log('Usage:');
    console.log('  npm run test:all              - Run all tests');
    console.log('  npm run test:specific <name>   - Run specific test');
    console.log('  node dist/cli.js --all        - Run all tests');
    console.log('  node dist/cli.js <testname>    - Run specific test\n');
    console.log('Available tests:');
    Object.values(tests).forEach(test => {
      console.log(`  ${test.name.padEnd(25)} - ${test.description}`);
    });
    process.exit(0);
  }
  
  try {
    if (args.includes('--all') || args.includes('--run-all')) {
      console.log('🚀 Running all CDP tests...\n');
      const results = await runAllTests();
      const failed = results.filter(r => !r.success).length;
      process.exit(failed > 0 ? 1 : 0);
    } else {
      const testName = args[0];
      console.log(`🚀 Running test: ${testName}\n`);
      const result = await runTest(testName);
      console.log('\nTest result:', result);
      process.exit(result.success ? 0 : 1);
    }
  } catch (error: any) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
} 