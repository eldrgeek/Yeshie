#!/usr/bin/env node

import CDP from 'chrome-remote-interface';

interface ConsoleMessage {
    level: string;
    text: string;
    source: string;
    timestamp: number;
}

interface MessageEvent {
    message: ConsoleMessage;
}

async function readConsoleLogs(): Promise<void> {
    let client: CDP.Client | undefined;
    
    try {
        // Connect to Chrome DevTools
        client = await CDP({ port: 9222 });
        
        const { Runtime, Console } = client;
        
        // Enable runtime and console
        await Runtime.enable();
        await Console.enable();
        
        console.log('🔗 Connected to Chrome DevTools, reading console logs...\n');
        
        // Set up console message listener
        Console.messageAdded(({ message }: MessageEvent) => {
            const { level, text, timestamp } = message;
            
            // Filter for Yeshie-related logs
            if (text && (
                text.includes('Yeshie') || 
                text.includes('[Logger]') ||
                text.includes('speechGlobalState') ||
                text.includes('ExtComms') ||
                text.includes('bridge function') ||
                text.includes('🔧') ||
                text.includes('✅') ||
                text.includes('❌')
            )) {
                const time = new Date(timestamp * 1000).toLocaleTimeString();
                const levelIcon: Record<string, string> = {
                    'log': '📄',
                    'info': 'ℹ️',
                    'warn': '⚠️',
                    'error': '❌',
                    'debug': '🐛'
                };
                const icon = levelIcon[level] || '📄';
                
                console.log(`${icon} [${time}] ${level.toUpperCase()}: ${text}`);
            }
        });
        
        // Keep the connection alive to continue receiving logs
        console.log('👀 Watching for Yeshie logs... (Press Ctrl+C to stop)\n');
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Stopping log monitoring...');
            if (client) {
                await client.close();
            }
            process.exit(0);
        });
        
        // Keep the process alive
        await new Promise(() => {}); // Wait indefinitely
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('❌ Failed to connect to Chrome DevTools:', errorMessage);
        console.log('\n💡 Make sure Chrome is running with debugging enabled:');
        console.log('   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    readConsoleLogs();
}

export { readConsoleLogs }; 