import CDP from 'chrome-remote-interface';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CDPConnectionConfig, CDPClient, TestResult } from '../types/cdp-types';

const execAsync = promisify(exec);

export async function testCDPConnection(): Promise<TestResult> {
    console.log('🔍 Testing Chrome DevTools Protocol Connection');
    console.log('===============================================\n');
    
    // Try different connection approaches
    const attempts: CDPConnectionConfig[] = [
        { host: 'localhost', port: 9222 },
        { host: '127.0.0.1', port: 9222 },
        { port: 9222 }, // default
    ];
    
    for (const config of attempts) {
        console.log(`🔌 Attempting connection with config:`, config);
        
        try {
            const client: CDPClient = await CDP(config) as CDPClient;
            console.log('✅ Connected successfully!');
            
            const { Target } = client;
            const targets = await Target.getTargets();
            
            // Handle different response structures
            const targetsList = targets.targetInfos || targets.targets || [];
            console.log(`📋 Found ${targetsList.length} targets`);
            
            // Show a few targets
            targetsList.slice(0, 3).forEach((target, index) => {
                console.log(`   ${index + 1}. ${target.type}: ${target.title || target.url}`);
            });
            
            await client.close();
            console.log('✅ Connection test successful!\n');
            
            return {
                success: true,
                message: 'CDP connection successful',
                details: { config, targetCount: targetsList.length }
            };
            
        } catch (error: any) {
            console.log(`❌ Failed with config ${JSON.stringify(config)}:`);
            console.log(`   Error: ${error.message}`);
            console.log(`   Code: ${error.code || 'N/A'}\n`);
        }
    }
    
    console.log('❌ All connection attempts failed');
    
    // Additional debugging
    await debugConnectionIssues();
    
    return {
        success: false,
        message: 'All CDP connection attempts failed'
    };
}

async function debugConnectionIssues(): Promise<void> {
    console.log('🔍 Additional debugging information:');
    
    try {
        // Check if port is listening
        const { stdout: lsofOutput } = await execAsync('lsof -i :9222');
        if (lsofOutput.trim()) {
            console.log('📡 Port 9222 is being used by:');
            console.log(lsofOutput);
        }
    } catch {
        console.log('❌ Port 9222 is not listening');
    }
    
    try {
        // Check network status
        const { stdout: netstatOutput } = await execAsync('netstat -an | grep 9222');
        if (netstatOutput.trim()) {
            console.log('🌐 Network status for port 9222:');
            console.log(netstatOutput);
        }
    } catch {
        console.log('❌ No network activity on port 9222');
    }
}

// Allow direct execution
if (require.main === module) {
    testCDPConnection()
        .then(result => {
            console.log('Test result:', result);
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test failed:', error);
            process.exit(1);
        });
} 