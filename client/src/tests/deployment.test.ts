import { describe, it, expect } from 'vitest';
import { 
  parseDeploymentCommand,
  generateNetlifyDeployCommand,
  generateVercelDeployCommand,
  generateFirebaseProjectCommand,
  generateFirebaseWorkflow,
  WorkflowConfig,
  DeploymentConfig,
  ProjectConfig
} from '../services/deployment';

describe('Deployment Command Parser', () => {
  describe('parseDeploymentCommand', () => {
    it('should parse "deploy to netlify" command', () => {
      const result = parseDeploymentCommand('deploy to netlify');
      expect(result).not.toBeNull();
      expect(result?.provider).toBe('netlify');
      expect(result?.command).toBe('npx netlify-cli deploy --dir=client/dist');
    });

    it('should parse "deploy to vercel" command', () => {
      const result = parseDeploymentCommand('deploy to vercel');
      expect(result).not.toBeNull();
      expect(result?.provider).toBe('vercel');
      expect(result?.command).toBe('npx vercel client');
    });

    it('should parse commands with additional options', () => {
      const result = parseDeploymentCommand('deploy to netlify project:my-site team:my-team');
      expect(result).not.toBeNull();
      expect(result?.provider).toBe('netlify');
      expect(result?.command).toContain('--prod');
      expect(result?.command).toContain('--site=my-site');
      expect(result?.command).toContain('--auth=my-team');
    });

    it('should parse "create firebase project" command', () => {
      const result = parseDeploymentCommand('create firebase project my');
      expect(result).not.toBeNull();
      expect(result?.provider).toBe('firebase');
      expect(result?.command).toBe('npx firebase projects:create my');
    });

    it('should parse "generate keys" command', () => {
      const result = parseDeploymentCommand('generate firebase keys project:my-project');
      expect(result).not.toBeNull();
      expect(result?.provider).toBe('firebase');
      expect(result?.command).toBe('npx firebase apps:sdkconfig web --project=my-project --json');
    });

    it('should parse "generate firebase project" command as a workflow', () => {
      const result = parseDeploymentCommand('generate firebase project my');
      expect(result).not.toBeNull();
      expect(result?.provider).toBe('firebase');
      expect(result?.workflow).toBeDefined();
      expect(result?.workflow?.type).toBe('firebase-project-setup');
      expect(result?.workflow?.projectName).toBe('my');
    });

    it('should return null for unrecognized commands', () => {
      const result = parseDeploymentCommand('this is not a valid command');
      expect(result).toBeNull();
    });
  });

  describe('Command Generators', () => {
    it('should generate correct Netlify deploy command', () => {
      const config: DeploymentConfig = {
        provider: 'netlify',
        projectName: 'my-site',
        teamId: 'my-team',
        directory: 'build'
      };
      
      const command = generateNetlifyDeployCommand(config);
      expect(command).toBe('npx netlify-cli deploy --dir=build --prod --site=my-site --auth=my-team');
    });

    it('should generate correct Vercel deploy command', () => {
      const config: DeploymentConfig = {
        provider: 'vercel',
        projectName: 'my-app',
        teamId: 'my-team',
        directory: 'dist',
        environmentVariables: {
          API_KEY: 'secret-key'
        }
      };
      
      const command = generateVercelDeployCommand(config);
      expect(command).toBe('npx vercel dist --prod --name=my-app --scope=my-team -e API_KEY="secret-key"');
    });

    it('should generate Firebase project command', () => {
      const config: ProjectConfig = {
        provider: 'firebase',
        projectName: 'my-project',
        region: 'us-central'
      };
      
      const command = generateFirebaseProjectCommand(config);
      expect(command).toBe('npx firebase projects:create my-project --region=us-central');
    });
  });

  describe('Workflow Generator', () => {
    it('should generate complete Firebase workflow steps', () => {
      const workflow: WorkflowConfig = {
        type: 'firebase-project-setup',
        projectName: 'test-project'
      };
      
      const steps = generateFirebaseWorkflow(workflow);
      
      expect(steps.length).toBe(3);
      expect(steps[0].command).toContain('projects:create test-project');
      expect(steps[1].command).toContain('apps:create web');
      expect(steps[2].command).toContain('apps:sdkconfig web');
    });
  });
}); 