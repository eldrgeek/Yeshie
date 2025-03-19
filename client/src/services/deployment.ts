import { db } from './firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

// Define deployment configurations interface
export interface DeploymentConfig {
  provider: 'vercel' | 'netlify';
  teamId?: string;
  projectName?: string;
  directory?: string;
  environmentVariables?: Record<string, string>;
}

// Define project creation interface
export interface ProjectConfig {
  provider: 'firebase' | 'vercel' | 'netlify';
  projectName: string;
  region?: string;
  teamId?: string;
}

// Define workflow interface
export interface WorkflowConfig {
  type: 'firebase-project-setup' | 'netlify-project-setup' | 'vercel-project-setup';
  projectName: string;
  region?: string;
  teamId?: string;
}

/**
 * Generate a Netlify deployment command based on configuration
 */
export function generateNetlifyDeployCommand(config: DeploymentConfig): string {
  // Default to deploying the client/dist directory if not specified
  const directory = config.directory || 'client/dist';
  
  let command = `npx netlify-cli deploy --dir=${directory}`;
  
  // Add production flag if projectName is provided (assuming it's a production deploy)
  if (config.projectName) {
    command += ` --prod --site=${config.projectName}`;
  }
  
  // Add team flag if teamId is provided
  if (config.teamId) {
    command += ` --auth=${config.teamId}`;
  }
  
  return command;
}

/**
 * Generate a Vercel deployment command based on configuration
 */
export function generateVercelDeployCommand(config: DeploymentConfig): string {
  // Default to deploying the client directory if not specified
  const directory = config.directory || 'client';
  
  let command = `npx vercel ${directory}`;
  
  // Add production flag if it's meant to be a production deployment
  if (config.projectName) {
    command += ` --prod --name=${config.projectName}`;
  }
  
  // Add team flag if teamId is provided
  if (config.teamId) {
    command += ` --scope=${config.teamId}`;
  }
  
  // Add environment variables if provided
  if (config.environmentVariables && Object.keys(config.environmentVariables).length > 0) {
    Object.entries(config.environmentVariables).forEach(([key, value]) => {
      command += ` -e ${key}="${value}"`;
    });
  }
  
  return command;
}

/**
 * Generate command to create a new Firebase project
 */
export function generateFirebaseProjectCommand(config: ProjectConfig): string {
  let command = `npx firebase projects:create ${config.projectName}`;
  
  if (config.region) {
    command += ` --region=${config.region}`;
  }
  
  return command;
}

/**
 * Generate command to setup Firebase for web and get config
 */
export function generateFirebaseWebSetupCommand(projectId: string, appName: string = 'web'): string {
  return `npx firebase apps:create web ${appName} --project=${projectId} --json`;
}

/**
 * Generate command to get Firebase config
 */
export function generateFirebaseConfigCommand(projectId: string): string {
  return `npx firebase apps:sdkconfig web --project=${projectId} --json`;
}

/**
 * Generate command to create a new Netlify site
 */
export function generateNetlifySiteCreateCommand(config: ProjectConfig): string {
  let command = `npx netlify sites:create --name=${config.projectName}`;
  
  if (config.teamId) {
    command += ` --account=${config.teamId}`;
  }
  
  // Add JSON flag to get structured output that can be parsed
  command += ` --json`;
  
  return command;
}

/**
 * Generate command to create a new Netlify personal access token
 */
export function generateNetlifyTokenCommand(): string {
  return `npx netlify api createAccessToken --data '{"description": "Created via Yeshie"}' --json`;
}

/**
 * Generate command to create a new Vercel project
 */
export function generateVercelProjectCommand(config: ProjectConfig): string {
  let command = `npx vercel project add ${config.projectName}`;
  
  if (config.teamId) {
    command += ` --scope=${config.teamId}`;
  }
  
  // Add JSON flag for structured output
  command += ` --json`;
  
  return command;
}

/**
 * Generate command to create a new Vercel token
 */
export function generateVercelTokenCommand(teamId?: string): string {
  let command = `npx vercel whoami --token`;
  
  if (teamId) {
    command += ` --scope=${teamId}`;
  }
  
  return command;
}

/**
 * Generate Firebase setup workflow steps
 * @param config Configuration for the Firebase project
 * @returns An array of workflow step objects with commands and descriptions
 */
export function generateFirebaseWorkflow(config: WorkflowConfig): Array<{command: string, description: string, expectsOutput: boolean}> {
  const projectName = config.projectName;
  
  return [
    {
      command: generateFirebaseProjectCommand({ provider: 'firebase', projectName, region: config.region }),
      description: `Creating Firebase project: ${projectName}`,
      expectsOutput: true
    },
    {
      command: generateFirebaseWebSetupCommand(projectName),
      description: `Registering web app for project: ${projectName}`,
      expectsOutput: true
    },
    {
      command: generateFirebaseConfigCommand(projectName),
      description: `Generating configuration for project: ${projectName}`,
      expectsOutput: true
    }
  ];
}

/**
 * Log deployment to Firestore
 */
export async function logDeployment(provider: string, command: string, status: string): Promise<void> {
  try {
    await addDoc(collection(db, 'deployments'), {
      provider,
      command,
      status,
      timestamp: Timestamp.now()
    });
  } catch (error) {
    console.error('Error logging deployment:', error);
  }
}

/**
 * Get deployment command based on text input
 */
export function parseDeploymentCommand(text: string): { command: string; provider: string; workflow?: WorkflowConfig } | null {
  // Match "deploy to netlify" or "deploy to vercel" with optional configurations
  const deployMatch = text.match(/deploy\s+to\s+(netlify|vercel)(?:\s+(.*))?/i);
  
  if (deployMatch) {
    const provider = deployMatch[1].toLowerCase();
    const configText = deployMatch[2] || '';
    
    // Parse optional configurations
    const config: DeploymentConfig = { 
      provider: provider as 'vercel' | 'netlify' 
    };
    
    // Extract team/project name if present
    const teamMatch = configText.match(/team[:\s]+([^\s,]+)/i);
    if (teamMatch) config.teamId = teamMatch[1];
    
    const projectMatch = configText.match(/project[:\s]+([^\s,]+)/i);
    if (projectMatch) config.projectName = projectMatch[1];
    
    const dirMatch = configText.match(/dir(?:ectory)?[:\s]+([^\s,]+)/i);
    if (dirMatch) config.directory = dirMatch[1];
    
    // Generate the appropriate command
    if (provider === 'netlify') {
      return {
        command: generateNetlifyDeployCommand(config),
        provider
      };
    } else if (provider === 'vercel') {
      return {
        command: generateVercelDeployCommand(config),
        provider
      };
    }
  }
  
  // Match "create project" commands
  const createProjectMatch = text.match(/create\s+(firebase|netlify|vercel)\s+project\s+(\w+)(?:\s+(.*))?/i);
  
  if (createProjectMatch) {
    const provider = createProjectMatch[1].toLowerCase() as 'firebase' | 'vercel' | 'netlify';
    const projectName = createProjectMatch[2];
    const configText = createProjectMatch[3] || '';
    
    // Parse optional configurations
    const config: ProjectConfig = {
      provider,
      projectName
    };
    
    // Extract team/region if present
    const teamMatch = configText.match(/team[:\s]+([^\s,]+)/i);
    if (teamMatch) config.teamId = teamMatch[1];
    
    const regionMatch = configText.match(/region[:\s]+([^\s,]+)/i);
    if (regionMatch) config.region = regionMatch[1];
    
    // Generate the appropriate command
    if (provider === 'firebase') {
      return {
        command: generateFirebaseProjectCommand(config),
        provider
      };
    } else if (provider === 'netlify') {
      return {
        command: generateNetlifySiteCreateCommand(config),
        provider
      };
    } else if (provider === 'vercel') {
      return {
        command: generateVercelProjectCommand(config),
        provider
      };
    }
  }
  
  // Match "generate keys" commands
  const generateKeysMatch = text.match(/generate\s+(firebase|netlify|vercel)\s+keys(?:\s+(.*))?/i);
  
  if (generateKeysMatch) {
    const provider = generateKeysMatch[1].toLowerCase();
    const configText = generateKeysMatch[2] || '';
    
    // Extract project ID if present
    const projectMatch = configText.match(/project[:\s]+([^\s,]+)/i);
    const projectId = projectMatch ? projectMatch[1] : '';
    
    // Extract app name for Firebase
    // const appMatch = configText.match(/app[:\s]+([^\s,]+)/i);
    // const appName = appMatch ? appMatch[1] : 'web';
    
    if (provider === 'firebase' && projectId) {
      return {
        command: generateFirebaseConfigCommand(projectId),
        provider
      };
    } else if (provider === 'netlify') {
      return {
        command: generateNetlifyTokenCommand(),
        provider
      };
    } else if (provider === 'vercel') {
      const teamMatch = configText.match(/team[:\s]+([^\s,]+)/i);
      const teamId = teamMatch ? teamMatch[1] : undefined;
      
      return {
        command: generateVercelTokenCommand(teamId),
        provider
      };
    }
  }
  
  // Match "generate firebase project" for automated workflow
  const generateProjectMatch = text.match(/generate\s+(firebase|netlify|vercel)\s+project(?:\s+(\w+))?(?:\s+(.*))?/i);
  
  if (generateProjectMatch) {
    const provider = generateProjectMatch[1].toLowerCase() as 'firebase' | 'vercel' | 'netlify';
    // If no project name specified, generate a random one
    const projectName = generateProjectMatch[2] || `${provider}-project-${Date.now().toString().slice(-6)}`;
    const configText = generateProjectMatch[3] || '';
    
    // Parse optional configurations
    const workflowConfig: WorkflowConfig = {
      type: `${provider}-project-setup` as 'firebase-project-setup' | 'netlify-project-setup' | 'vercel-project-setup',
      projectName
    };
    
    // Extract team/region if present
    const teamMatch = configText.match(/team[:\s]+([^\s,]+)/i);
    if (teamMatch) workflowConfig.teamId = teamMatch[1];
    
    const regionMatch = configText.match(/region[:\s]+([^\s,]+)/i);
    if (regionMatch) workflowConfig.region = regionMatch[1];
    
    if (provider === 'firebase') {
      // For firebase, we return the first command, but also include the workflow config
      return {
        command: generateFirebaseProjectCommand({ provider: 'firebase', projectName, region: workflowConfig.region }),
        provider,
        workflow: workflowConfig
      };
    }
    // We could add similar workflows for Netlify and Vercel in the future
  }
  
  return null;
} 