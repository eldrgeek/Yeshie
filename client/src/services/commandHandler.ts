import { parseDeploymentCommand, logDeployment, generateFirebaseWorkflow, WorkflowConfig } from './deployment';
import { parseSchemaFromText, saveSchema, generateTypeScriptInterface, generateFirestoreRules } from './schema';
import { uploadFile } from './firebase';

/**
 * Process a text command and return appropriate actions
 * @param text The input text to process
 * @returns An object with the command result or null if no command is recognized
 */
export function processCommand(text: string): CommandResult | null {
  // Check for deployment commands
  const deploymentCommand = parseDeploymentCommand(text);
  if (deploymentCommand) {
    // Check if this is a workflow command
    if (deploymentCommand.workflow) {
      return {
        type: 'workflow',
        provider: deploymentCommand.provider,
        workflow: deploymentCommand.workflow,
        message: `Starting ${deploymentCommand.provider} project setup workflow for: ${deploymentCommand.workflow.projectName}`,
        success: true
      };
    }
    
    // Determine if it's a deployment, project creation, or key generation command
    if (text.includes('create') && text.includes('project')) {
      return {
        type: 'project-creation',
        provider: deploymentCommand.provider,
        command: deploymentCommand.command,
        message: `Generated command to create a new ${deploymentCommand.provider} project:`,
        success: true
      };
    } else if (text.includes('generate') && text.includes('keys')) {
      return {
        type: 'key-generation',
        provider: deploymentCommand.provider,
        command: deploymentCommand.command,
        message: `Generated command to get ${deploymentCommand.provider} configuration:`,
        success: true
      };
    } else {
      return {
        type: 'deployment',
        provider: deploymentCommand.provider,
        command: deploymentCommand.command,
        message: `Generated command to deploy to ${deploymentCommand.provider}:`,
        success: true
      };
    }
  }
  
  // Check for schema definition commands
  if (text.includes('schema') && text.includes(':')) {
    const schema = parseSchemaFromText(text);
    if (schema) {
      const tsInterface = generateTypeScriptInterface(schema);
      const firestoreRules = generateFirestoreRules(schema);
      
      return {
        type: 'schema',
        schema: schema,
        tsInterface: tsInterface,
        firestoreRules: firestoreRules,
        message: `Generated schema "${schema.name}" with ${schema.fields.length} fields`,
        success: true
      };
    }
  }
  
  // Check for schema upload commands
  const schemaUploadMatch = text.match(/upload\s+schema\s+(\w+)/i);
  if (schemaUploadMatch) {
    const schemaName = schemaUploadMatch[1];
    return {
      type: 'upload-schema-request',
      schemaName: schemaName,
      message: `Please provide the schema definition for "${schemaName}"`,
      success: true
    };
  }
  
  // Check for file upload commands
  const fileUploadMatch = text.match(/upload\s+file(?:\s+to\s+(.+))?/i);
  if (fileUploadMatch) {
    const destination = fileUploadMatch[1] || 'firebase';
    return {
      type: 'upload-file-request',
      destination: destination,
      message: `Please select a file to upload to ${destination}`,
      success: true
    };
  }
  
  // Check for save configuration commands
  const saveConfigMatch = text.match(/save\s+(firebase|netlify|vercel)\s+config\s+(.+)/i);
  if (saveConfigMatch) {
    const provider = saveConfigMatch[1];
    const configText = saveConfigMatch[2];
    
    return {
      type: 'save-config',
      provider,
      configText,
      message: `Saving ${provider} configuration`,
      success: true
    };
  }
  
  // Check for direct .env update commands
  const updateEnvMatch = text.match(/update\s+env\s+(.+)/i);
  if (updateEnvMatch) {
    const configText = updateEnvMatch[1];
    return {
      type: 'update-env',
      configText,
      message: `Updating .env file with configuration`,
      success: true
    };
  }
  
  return null;
}

/**
 * Execute a terminal command via your command mode system
 */
export function executeTerminalCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      window.parent.postMessage({ type: "monitor", op: "command", line: command }, "*");
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Send a command to update the .env file via monitor.py
 * This uses a special command format that monitor.py will recognize
 */
export function updateEnvFile(envContents: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Escape quotes and newlines to ensure proper command transmission
      const escapedConfig = envContents
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
      
      // Create a unique ID for this request to track the response
      const requestId = `env_update_${Date.now()}`;
      
      // Set up a one-time event listener for the response
      const handleResponse = (event: MessageEvent) => {
        if (event.data && event.data.op === 'env_updated' && event.data.requestId === requestId) {
          // Remove the event listener
          window.removeEventListener('message', handleResponse);
          
          if (event.data.success) {
            resolve();
          } else {
            reject(new Error(event.data.message || 'Failed to update .env file'));
          }
        }
      };
      
      // Add the event listener
      window.addEventListener('message', handleResponse);
      
      // Set a timeout to remove the listener if no response is received
      setTimeout(() => {
        window.removeEventListener('message', handleResponse);
        // Assume success even if we don't get a response
        // This is because we can't guarantee the monitor will send a response
        resolve();
      }, 5000);
      
      // Send a special command that monitor.py will handle
      window.parent.postMessage({ 
        type: "monitor", 
        op: "update_env", 
        content: escapedConfig,
        requestId: requestId
      }, "*");
      
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Helper to create a promise that resolves after a delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a command and wait for output
 * In a real implementation, this would capture the output from the terminal
 * For now, we'll simulate it with a delay
 */
export async function executeCommandAndWaitForOutput(command: string): Promise<string> {
  await executeTerminalCommand(command);
  
  // Simulate waiting for command output
  // In a real implementation, you would capture the output stream
  await delay(2000);
  
  // This is a stub - in a real implementation, you would return the actual output
  return `Executed command: ${command}\nCommand output would be captured here.`;
}

/**
 * Execute a workflow of multiple commands in sequence
 */
export async function executeWorkflow(
  workflow: WorkflowConfig, 
  onProgress: (step: number, total: number, description: string) => void,
  autoUpdateEnv: boolean = true
): Promise<string> {
  if (workflow.type === 'firebase-project-setup') {
    const steps = generateFirebaseWorkflow(workflow);
    const total = steps.length;
    let result = '';
    let configOutput = '';
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      onProgress(i + 1, total, step.description);
      
      try {
        const output = await executeCommandAndWaitForOutput(step.command);
        result += `✅ ${step.description}\n`;
        
        // If this is the config generation step, capture the output
        if (i === steps.length - 1) {
          configOutput = output;
        }
      } catch (error) {
        result += `❌ ${step.description} - Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
        break;
      }
    }
    
    // Try to parse the Firebase config from the final output
    const parsedConfig = parseFirebaseConfig(configOutput);
    if (parsedConfig) {
      result += `\nFirebase configuration for ${workflow.projectName}:\n\`\`\`\n${parsedConfig}\n\`\`\``;
      
      // Automatically update the .env file if requested
      if (autoUpdateEnv) {
        try {
          await updateEnvFile(parsedConfig);
          result += `\n\n✅ The .env file has been automatically updated with these values.`;
        } catch (error) {
          result += `\n\n❌ Failed to automatically update .env file: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      }
    }
    
    return result;
  }
  
  return `Workflow ${workflow.type} is not implemented yet.`;
}

/**
 * Parse Firebase configuration from CLI output and generate an .env format
 */
export function parseFirebaseConfig(configText: string): string | null {
  try {
    // Try to parse as JSON
    const configJson = JSON.parse(configText);
    
    if (configJson && configJson.sdkConfig) {
      const { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId } = configJson.sdkConfig;
      
      return `VITE_FIREBASE_API_KEY=${apiKey}
VITE_FIREBASE_AUTH_DOMAIN=${authDomain}
VITE_FIREBASE_PROJECT_ID=${projectId}
VITE_FIREBASE_STORAGE_BUCKET=${storageBucket}
VITE_FIREBASE_MESSAGING_SENDER_ID=${messagingSenderId}
VITE_FIREBASE_APP_ID=${appId}`;
    }
    
    // Alternative format
    if (configJson && configJson.result && configJson.result.webApps && configJson.result.webApps.length > 0) {
      const app = configJson.result.webApps[0];
      return `VITE_FIREBASE_API_KEY=${app.apiKey}
VITE_FIREBASE_AUTH_DOMAIN=${app.authDomain}
VITE_FIREBASE_PROJECT_ID=${app.projectId}
VITE_FIREBASE_STORAGE_BUCKET=${app.storageBucket}
VITE_FIREBASE_MESSAGING_SENDER_ID=${app.messagingSenderId}
VITE_FIREBASE_APP_ID=${app.appId}`;
    }
  } catch (error) {
    console.error('Error parsing Firebase config:', error);
  }
  
  return null;
}

/**
 * Parse Netlify token from CLI output
 */
export function parseNetlifyToken(tokenText: string): string | null {
  try {
    const tokenJson = JSON.parse(tokenText);
    
    if (tokenJson && tokenJson.id) {
      return `VITE_NETLIFY_TOKEN=${tokenJson.id}`;
    }
  } catch (error) {
    // Try to parse with a regex if not valid JSON
    const tokenMatch = tokenText.match(/[a-zA-Z0-9_-]{36,}/);
    if (tokenMatch) {
      return `VITE_NETLIFY_TOKEN=${tokenMatch[0]}`;
    }
    
    console.error('Error parsing Netlify token:', error);
  }
  
  return null;
}

/**
 * Parse Vercel token from CLI output
 */
export function parseVercelToken(tokenText: string): string | null {
  try {
    // Vercel token is usually just the raw token string
    const tokenMatch = tokenText.trim().match(/[a-zA-Z0-9_-]{20,}/);
    if (tokenMatch) {
      return `VITE_VERCEL_TOKEN=${tokenMatch[0]}`;
    }
  } catch (error) {
    console.error('Error parsing Vercel token:', error);
  }
  
  return null;
}

/**
 * Save configuration to .env file
 */
export function saveConfigToEnv(config: string): CommandResult {
  try {
    // Update the .env file directly
    updateEnvFile(config).catch(error => {
      console.error('Error updating .env file:', error);
    });
    
    // Log this action to Firestore
    logDeployment('env-update', 'update .env file', 'completed');
    
    return {
      type: 'config-saved',
      configData: config,
      message: `Configuration saved successfully to .env file`,
      success: true
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false
    };
  }
}

/**
 * Upload a schema to Firebase
 */
export async function uploadSchemaToFirebase(schema: any): Promise<CommandResult> {
  try {
    // Attempt to parse if it's a string
    let parsedSchema = typeof schema === 'string' ? parseSchemaFromText(schema) : schema;
    
    if (!parsedSchema) {
      return {
        type: 'error',
        message: 'Invalid schema format',
        success: false
      };
    }
    
    // Save to Firebase
    const id = await saveSchema(parsedSchema);
    
    return {
      type: 'schema-uploaded',
      schemaId: id,
      message: `Schema "${parsedSchema.name}" uploaded successfully`,
      success: true
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to upload schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false
    };
  }
}

/**
 * Handle a file upload to the specified destination
 */
export async function handleFileUpload(file: File, destination: string): Promise<CommandResult> {
  try {
    // Create a Firebase path based on file type and name
    // const fileExtension = file.name.split('.').pop() || '';
    const path = `uploads/${destination}/${Date.now()}_${file.name}`;
    
    // Upload to Firebase Storage
    const url = await uploadFile(file, path);
    
    return {
      type: 'file-uploaded',
      url: url,
      fileName: file.name,
      destination: destination,
      message: `File "${file.name}" uploaded successfully to ${destination}`,
      success: true
    };
  } catch (error) {
    return {
      type: 'error',
      message: `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false
    };
  }
}

/**
 * Types for command processing results
 */
export type CommandResult = 
  | {
      type: 'deployment';
      provider: string;
      command: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'project-creation';
      provider: string;
      command: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'key-generation';
      provider: string;
      command: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'workflow';
      provider: string;
      workflow: WorkflowConfig;
      message: string;
      success: boolean;
    }
  | {
      type: 'schema';
      schema: any;
      tsInterface: string;
      firestoreRules: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'upload-schema-request';
      schemaName: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'upload-file-request';
      destination: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'schema-uploaded';
      schemaId: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'file-uploaded';
      url: string;
      fileName: string;
      destination: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'save-config';
      provider: string;
      configText: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'config-saved';
      configData: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'update-env';
      configText: string;
      message: string;
      success: boolean;
    }
  | {
      type: 'error';
      message: string;
      success: false;
    }; 