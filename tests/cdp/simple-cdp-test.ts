import CDP from 'chrome-remote-interface';
import { exec } from 'child_process';

interface CDPConfig {
    host?: string;
    port: number;
}

interface TargetInfo {
    type: string;
    title?: string;
    url?: string;
}

interface TargetsResponse {
    targetInfos: TargetInfo[];
}

async function testCDPConnection(): Promise<boolean> {
    console.log('🔍 Testing Chrome DevTools Protocol Connection');
    console.log('===============================================\n');
    
    // Try different approaches
    const attempts: CDPConfig[] = [
        { host: 'localhost', port: 9222 },
        { host: '127.0.0.1', port: 9222 },
        { port: 9222 }, // default
    ];
    
    for (const config of attempts) {
        console.log(`🔌 Attempting connection with config:`, config);
        
        try {
            const client = await CDP(config);
            console.log('✅ Connected successfully!');
            
            const { Target } = client;
            const targets: TargetsResponse = await Target.getTargets();
            
            console.log(`📋 Found ${targets.targetInfos.length} targets`);
            
            // Show a few targets
            targets.targetInfos.slice(0, 3).forEach((target, index) => {
                console.log(`   ${index + 1}. ${target.type}: ${target.title || target.url}`);
            });
            
            await client.close();
            console.log('✅ Connection test successful!\n');
            return true;
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorCode = error instanceof Error && 'code' in error ? (error as any).code : 'N/A';
            console.log(`❌ Failed with config ${JSON.stringify(config)}:`);
            console.log(`   Error: ${errorMessage}`);
            console.log(`   Code: ${errorCode}\n`);
        }
    }
    
    console.log('❌ All connection attempts failed');
    
    // Additional debugging
    console.log('🔍 Additional debugging information:');
    
    // Check if port is listening
    return new Promise((resolve) => {
        exec('lsof -i :9222', (error, stdout, stderr) => {
            if (stdout) {
                console.log('📡 Port 9222 is being used by:');
                console.log(stdout);
            } else {
                console.log('❌ Port 9222 is not listening');
            }
            
            exec('netstat -an | grep 9222', (error2, stdout2, stderr2) => {
                if (stdout2) {
                    console.log('🌐 Network status for port 9222:');
                    console.log(stdout2);
                } else {
                    console.log('❌ No network activity on port 9222');
                }
                resolve(false);
            });
        });
    });
}

testCDPConnection().catch(console.error); 