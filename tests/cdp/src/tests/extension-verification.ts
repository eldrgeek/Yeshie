import CDP from 'chrome-remote-interface';
import { CDPTarget, CDPClient, ExtensionInfo, TestResult } from '../types/cdp-types';

export async function checkExtensionSimple(): Promise<TestResult> {
    console.log('🧪 Simple Extension Check...\n');

    try {
        // Step 1: List all available targets
        console.log('📍 Step 1: List available targets...');
        const targets = await CDP.List();
        
        console.log('🔍 Available targets:');
        targets.forEach((target: CDPTarget, index: number) => {
            console.log(`  ${index + 1}. ${target.type}: ${target.title || target.url}`);
        });

        // Find service worker targets
        const serviceWorkers = targets.filter((t: CDPTarget) => t.type === 'service_worker');
        console.log(`\n🎯 Found ${serviceWorkers.length} service worker(s):`);
        serviceWorkers.forEach((sw: CDPTarget, index: number) => {
            console.log(`  ${index + 1}. ${sw.url}`);
        });

        // Find Yeshie extension
        const yeshieExtension = findYeshieExtension(serviceWorkers);

        if (yeshieExtension) {
            console.log(`\n✅ Found Yeshie extension: ${yeshieExtension.url}`);
            console.log(`   Title: ${yeshieExtension.title}`);
            console.log(`   ID: ${yeshieExtension.id}`);

            // Test service worker connection
            const serviceWorkerResult = await testServiceWorkerConnection(yeshieExtension);
            
            if (!serviceWorkerResult.success) {
                console.log('❌ Service worker connection failed');
            }
        } else {
            console.log('❌ Yeshie extension service worker not found');
            console.log('\n🔍 Looking for any extension-like service workers...');
            const extensionSWs = serviceWorkers.filter((sw: CDPTarget) => 
                sw.url.includes('chrome-extension://')
            );
            extensionSWs.forEach((sw: CDPTarget, index: number) => {
                console.log(`  ${index + 1}. ${sw.url} (${sw.title})`);
            });
        }

        // Step 3: Test content script presence on a page
        const contentScriptResult = await testContentScriptPresence(targets);

        console.log('\n✅ Simple extension check completed!');

        return {
            success: yeshieExtension !== null,
            message: yeshieExtension ? 'Extension found and verified' : 'Extension not found',
            details: {
                extensionFound: !!yeshieExtension,
                serviceWorkerCount: serviceWorkers.length,
                totalTargets: targets.length
            }
        };

    } catch (error: any) {
        console.error('❌ Check failed:', error.message);
        return {
            success: false,
            message: `Extension check failed: ${error.message}`
        };
    }
}

function findYeshieExtension(serviceWorkers: CDPTarget[]): CDPTarget | null {
    return serviceWorkers.find((sw: CDPTarget) => 
        sw.url.includes('chrome-extension://') && 
        (sw.url.includes('background') || sw.title === 'Yeshie')
    ) || null;
}

async function testServiceWorkerConnection(extension: CDPTarget): Promise<TestResult> {
    console.log('\n📍 Step 2: Connecting to Yeshie service worker...');
    
    try {
        const client: CDPClient = await CDP({ target: extension.id }) as CDPClient;
        const { Runtime } = client;
        await Runtime.enable();

        // Test basic functionality
        const basicTest = await Runtime.evaluate({
            expression: 'typeof globalThis'
        });
        console.log('🔍 Basic connection test:', basicTest.result.value);

        // Check for speech-related functions
        const functionsTest = await Runtime.evaluate({
            expression: `
                Object.keys(globalThis).filter(key => 
                    key.includes('Speech') || key.includes('speech')
                )
            `
        });
        console.log('🔍 Speech-related functions:', functionsTest.result.value);

        // Check specific functions
        const specificTest = await Runtime.evaluate({
            expression: `
                ({
                    getSpeechGlobalState: typeof globalThis.getSpeechGlobalState,
                    setSpeechGlobalState: typeof globalThis.setSpeechGlobalState,
                    registerSpeechEditor: typeof globalThis.registerSpeechEditor,
                    allKeys: Object.keys(globalThis).length
                })
            `
        });
        console.log('🔍 Specific function check:', JSON.stringify(specificTest.result.value, null, 2));

        await client.close();
        
        return {
            success: true,
            message: 'Service worker connection successful'
        };

    } catch (error: any) {
        console.log('❌ Failed to connect to service worker:', error.message);
        return {
            success: false,
            message: `Service worker connection failed: ${error.message}`
        };
    }
}

async function testContentScriptPresence(targets: CDPTarget[]): Promise<TestResult> {
    console.log('\n📍 Step 3: Testing content script on a page...');
    
    const pageTargets = targets.filter((t: CDPTarget) => t.type === 'page');
    
    if (pageTargets.length === 0) {
        console.log('❌ No page targets found');
        return {
            success: false,
            message: 'No page targets available for content script testing'
        };
    }

    try {
        // Use the first available page
        const pageTarget = pageTargets[0];
        console.log(`🔍 Testing on page: ${pageTarget.title || pageTarget.url}`);

        const client: CDPClient = await CDP({ target: pageTarget.id }) as CDPClient;
        const { Runtime } = client;
        await Runtime.enable();

        const contentScriptTest = await Runtime.evaluate({
            expression: `
                ({
                    hasSpeechGlobalState: typeof window.speechGlobalState,
                    windowKeys: Object.keys(window).filter(key => 
                        key.toLowerCase().includes('speech') || 
                        key.toLowerCase().includes('yeshie')
                    ),
                    url: window.location.href,
                    title: document.title
                })
            `
        });
        console.log('🔍 Content script test:', JSON.stringify(contentScriptTest.result.value, null, 2));

        await client.close();

        return {
            success: true,
            message: 'Content script test completed',
            details: contentScriptTest.result.value
        };

    } catch (error: any) {
        console.log('❌ Content script test failed:', error.message);
        return {
            success: false,
            message: `Content script test failed: ${error.message}`
        };
    }
}

// Allow direct execution
if (require.main === module) {
    checkExtensionSimple()
        .then(result => {
            console.log('Test result:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
} 