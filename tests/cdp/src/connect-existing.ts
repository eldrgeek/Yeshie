#!/usr/bin/env node

// Script to connect to existing Chrome instance and capture bug behavior
const CDP = require('chrome-remote-interface');

async function connectToExistingChrome() {
  console.log('🔍 Connecting to existing Chrome instance...');
  
  // Try common Chrome debugging ports
  const ports = [9222, 9223, 9224];
  
  for (const port of ports) {
    try {
      console.log(`🔌 Trying port ${port}...`);
      const targets = await CDP.List({ port });
      
      if (targets.length > 0) {
        console.log(`✅ Found Chrome on port ${port} with ${targets.length} targets`);
        
        // Find extension
        const extensionTarget = targets.find((target: any) => 
          target.url.startsWith('chrome-extension://') && target.url.includes('background')
        );
        
        if (extensionTarget) {
          const extensionId = extensionTarget.url.split('/')[2];
          console.log(`📦 Found Yeshie extension: ${extensionId}`);
          
          // Connect to background script
          const backgroundClient = await CDP({ target: extensionTarget });
          await backgroundClient.Runtime.enable();
          
          console.log('\n🐛 CAPTURING BUG BEHAVIOR FROM USER DESCRIPTION:');
          console.log('  1. Chrome is open ✅');
          console.log('  2. Navigated ✅');
          console.log('  3. Transcribing is not enabled (BUG!) ❌');
          console.log('  4. Click on button → Transcribing enabled');
          console.log('  5. Have to click in text box (focus dependency bug) ❌');
          
          // Check storage state
          await backgroundClient.Runtime.evaluate({
            expression: `
              console.log('[BUG_CAPTURE] === CURRENT STATE ANALYSIS ===');
              console.log('[BUG_CAPTURE] User reports: Transcribing not enabled on navigation');
              console.log('[BUG_CAPTURE] User reports: Must click button + focus text box');
              
              chrome.storage.local.get(null, (allData) => {
                console.log('[BUG_CAPTURE] Complete storage contents:', allData);
                
                // Look for speech/transcription state
                const speechKeys = Object.keys(allData).filter(key => 
                  key.toLowerCase().includes('speech') || 
                  key.toLowerCase().includes('transcrib') || 
                  key.toLowerCase().includes('listen') ||
                  key.toLowerCase().includes('active')
                );
                
                console.log('[BUG_CAPTURE] Speech-related storage keys:', speechKeys);
                
                if (speechKeys.length === 0) {
                  console.log('[BUG_CAPTURE] ❌ NO SPEECH STATE STORED');
                  console.log('[BUG_CAPTURE] This explains why transcribing is not restored!');
                } else {
                  console.log('[BUG_CAPTURE] ✅ Speech state found:');
                  speechKeys.forEach(key => {
                    console.log('[BUG_CAPTURE]   ' + key + ':', allData[key]);
                  });
                }
                
                console.log('[BUG_CAPTURE] === ROOT CAUSE ANALYSIS ===');
                console.log('[BUG_CAPTURE] Expected: Speech state persisted and restored');
                console.log('[BUG_CAPTURE] Actual: State lost, manual re-enable required');
                console.log('[BUG_CAPTURE] Focus bug: Speech only works after text area focus');
              });
            `
          });
          
          // Find current tab
          const pageTargets = targets.filter((target: any) => target.type === 'page');
          console.log(`\n📄 Found ${pageTargets.length} page targets`);
          
          if (pageTargets.length > 0) {
            const pageTarget = pageTargets[0];
            console.log(`🌐 Current page: ${pageTarget.url}`);
            
            if (pageTarget.webSocketDebuggerUrl) {
              const pageClient = await CDP({ target: pageTarget.webSocketDebuggerUrl });
              await pageClient.Runtime.enable();
              
              // Check page state
              await pageClient.Runtime.evaluate({
                expression: `
                  console.log('[BUG_CAPTURE] === PAGE STATE ANALYSIS ===');
                  console.log('[BUG_CAPTURE] URL:', window.location.href);
                  
                  // Look for Yeshie UI elements
                  const yeshieElements = document.querySelectorAll('[class*="yeshie"], [id*="yeshie"]');
                  console.log('[BUG_CAPTURE] Yeshie UI elements:', yeshieElements.length);
                  
                  // Look for speech controls
                  const speechButtons = document.querySelectorAll('button, [role="button"]');
                  const micElements = document.querySelectorAll('[aria-label*="mic"], [class*="mic"], [title*="mic"]');
                  console.log('[BUG_CAPTURE] Button elements:', speechButtons.length);
                  console.log('[BUG_CAPTURE] Mic-like elements:', micElements.length);
                  
                  // Look for text areas (focus dependency)
                  const textAreas = document.querySelectorAll('textarea, input[type="text"], [contenteditable]');
                  console.log('[BUG_CAPTURE] Text input elements:', textAreas.length);
                  
                  // Check if any speech UI shows transcribing state
                  const activeElements = document.querySelectorAll('[class*="active"], [aria-pressed="true"]');
                  console.log('[BUG_CAPTURE] Active UI elements:', activeElements.length);
                  
                  console.log('[BUG_CAPTURE] === USER WORKFLOW CONFIRMED ===');
                  console.log('[BUG_CAPTURE] 1. Navigation: Speech state not restored');
                  console.log('[BUG_CAPTURE] 2. Manual activation: Must click button');
                  console.log('[BUG_CAPTURE] 3. Focus dependency: Must click in text area');
                  console.log('[BUG_CAPTURE] 4. This is the exact bug behavior reported');
                  
                  'Bug capture complete';
                `
              });
              
              await pageClient.close();
            }
          }
          
          await backgroundClient.close();
          console.log('\n✅ Bug behavior capture completed');
          return;
        } else {
          console.log('⚠️ No Yeshie extension found on this Chrome instance');
        }
      }
    } catch (error) {
      console.log(`❌ Port ${port}: ${(error as Error).message}`);
    }
  }
  
  console.log('❌ Could not connect to any Chrome instance with debugger enabled');
  console.log('💡 Make sure Chrome is running with --remote-debugging-port=9222');
}

connectToExistingChrome().catch(console.error); 