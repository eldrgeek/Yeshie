#!/usr/bin/env node

import { CDPTestRunner } from './test-runner';
import { 
  testExtensionLoaded, 
  testBackgroundScriptMessages,
  testSpeechEditorFocus, 
  testTabTracking,
  testExtensionStorage,
  testSpeechEditorRegistration,
  testRealWorldNavigation,
  testSpeechEditorFocusBug,
  testSpeechEditorStatePersistence
} from './tests/basic-functionality';
import * as process from 'process';

async function main() {
  const args = process.argv.slice(2);
  const specificTest = args.find(arg => arg.startsWith('--test='))?.split('=')[1];
  const watchMode = args.includes('--watch');
  
  console.log('🎯 Yeshie CDP Test Runner');
  console.log('=========================\n');
  
  const runner = new CDPTestRunner();
  
  try {
    await runner.initialize();
    
    const tests = [
      { name: 'extension-loaded', fn: testExtensionLoaded },
      { name: 'background-messages', fn: testBackgroundScriptMessages },
      { name: 'extension-storage', fn: testExtensionStorage },
      { name: 'speech-editor-focus', fn: testSpeechEditorFocus },
      { name: 'speech-editor-registration', fn: testSpeechEditorRegistration },
      { name: 'tab-tracking', fn: testTabTracking },
      { name: 'real-world-navigation', fn: testRealWorldNavigation },
      { name: 'speech-editor-focus-bug', fn: testSpeechEditorFocusBug },
      { name: 'speech-editor-state-persistence', fn: testSpeechEditorStatePersistence }
    ];
    
    const testsToRun = specificTest 
      ? tests.filter(test => test.name === specificTest)
      : tests;
    
    if (testsToRun.length === 0) {
      console.error(`❌ Test "${specificTest}" not found`);
      console.log('Available tests:', tests.map(t => t.name).join(', '));
      process.exit(1);
    }
    
    console.log(`🧪 Running ${testsToRun.length} test(s)...\n`);
    
    for (const test of testsToRun) {
      await runner.runTest(test.name, test.fn);
    }
    
    await runner.exportResults();
    
    const results = runner.getResults();
    const failed = results.filter(r => r.status !== 'pass').length;
    
    console.log('\n📊 Test Summary:');
    console.log('================');
    console.log(`  Total: ${results.length}`);
    console.log(`  Passed: ${results.filter(r => r.status === 'pass').length}`);
    console.log(`  Failed: ${results.filter(r => r.status === 'fail').length}`);
    console.log(`  Errors: ${results.filter(r => r.status === 'error').length}`);
    
    if (!watchMode) {
      console.log('\n🧹 Cleaning up...');
      await runner.cleanup();
      process.exit(failed > 0 ? 1 : 0);
    } else {
      console.log('\n👀 Watch mode - Chrome will stay open for manual testing');
      console.log('🔍 You can inspect the extension in the opened Chrome instance');
      console.log('Press Ctrl+C to exit');
      
      process.on('SIGINT', async () => {
        console.log('\n🧹 Cleaning up...');
        await runner.cleanup();
        process.exit(0);
      });
    }
    
  } catch (error) {
    console.error('❌ Test runner failed:', error);
    await runner.cleanup();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 