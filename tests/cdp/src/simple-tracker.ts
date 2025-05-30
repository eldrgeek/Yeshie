#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

async function inspectBrowserState() {
  try {
    console.log('🔍 Inspecting current browser state...\n');
    
    const client = await CDP({ port: 9222 });
    const { Page, Runtime } = client;

    await Page.enable();
    await Runtime.enable();

    // Get current page info
    const targets = await CDP.List({ port: 9222 });
    console.log('📋 Current browser tabs:');
    targets.forEach((target: any, i: number) => {
      if (target.type === 'page') {
        console.log(`  ${i + 1}. ${target.title}`);
        console.log(`     URL: ${target.url}`);
      }
    });

    // Get the active page
    const activePage = targets.find((t: any) => t.type === 'page' && !t.url.startsWith('chrome://'));
    if (activePage) {
      console.log(`\n🎯 Analyzing active page: ${activePage.title}`);
      console.log(`   URL: ${activePage.url}`);

      // Connect to the active page
      const pageClient = await CDP({ target: activePage.id, port: 9222 });
      const { Runtime: PageRuntime } = pageClient;
      await PageRuntime.enable();

      // Check browser history length (indicates navigation)
      const historyInfo = await PageRuntime.evaluate({
        expression: `({
          historyLength: window.history.length,
          currentUrl: window.location.href,
          title: document.title,
          lastModified: document.lastModified
        })`
      });
      
      console.log('\n📊 Page state analysis:');
      console.log('   History length:', historyInfo.result.value.historyLength);
      console.log('   Current URL:', historyInfo.result.value.currentUrl);
      console.log('   Page title:', historyInfo.result.value.title);

      // Check for recent form interactions
      const formInfo = await PageRuntime.evaluate({
        expression: `({
          formCount: document.forms.length,
          inputCount: document.querySelectorAll('input').length,
          textareaCount: document.querySelectorAll('textarea').length,
          focusedElement: document.activeElement ? {
            tag: document.activeElement.tagName,
            type: document.activeElement.type,
            id: document.activeElement.id,
            className: document.activeElement.className
          } : null,
          recentValues: Array.from(document.querySelectorAll('input[type="text"], input[type="email"], textarea')).map(el => ({
            tag: el.tagName,
            type: el.type,
            id: el.id,
            hasValue: el.value.length > 0,
            valueLength: el.value.length
          }))
        })`
      });

      console.log('\n📝 Form interaction analysis:');
      console.log('   Forms on page:', formInfo.result.value.formCount);
      console.log('   Input fields:', formInfo.result.value.inputCount);
      console.log('   Text areas:', formInfo.result.value.textareaCount);
      
      if (formInfo.result.value.focusedElement) {
        console.log('   Currently focused:', formInfo.result.value.focusedElement);
      }

      if (formInfo.result.value.recentValues.length > 0) {
        console.log('   Fields with content:');
        formInfo.result.value.recentValues.forEach((field: any) => {
          if (field.hasValue) {
            console.log(`     ${field.tag}${field.type ? `[${field.type}]` : ''} (${field.id}): ${field.valueLength} characters`);
          }
        });
      }

      // Check for recent clicks or interactions
      const interactionInfo = await PageRuntime.evaluate({
        expression: `({
          clickableElements: document.querySelectorAll('button, a, [onclick]').length,
          recentlyClicked: Array.from(document.querySelectorAll('.clicked, .active, .selected')).length,
          scrollPosition: {
            x: window.scrollX,
            y: window.scrollY
          }
        })`
      });

      console.log('\n🖱️ Interaction analysis:');
      console.log('   Clickable elements:', interactionInfo.result.value.clickableElements);
      console.log('   Scroll position:', interactionInfo.result.value.scrollPosition);

      await pageClient.close();
    }

    await client.close();

  } catch (error: any) {
    console.error('❌ Failed to inspect browser:', error.message);
  }
}

inspectBrowserState().catch(console.error); 