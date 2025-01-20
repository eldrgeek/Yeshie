import { spawn } from "child_process";
import concurrently from "concurrently";
import { exit } from "process";
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as parser from '@babel/parser';
import traverse from '@babel/traverse';

interface FileAnalysis {
  hasWebSocket: boolean;
  imports: string[];
}

interface Job {
  name: string;
  do: string | { command: string; args: string[] };
  dependencies?: string[];
  env?: Record<string, string>;
}

enum Profile {
  DEFAULT = 'default',
  REPL = 'repl',
  DEV = 'dev',
  WIN = 'win',
  LLM = 'llm',
  CODE_STORE = 'codeStore',
  ALL = 'all'
}

class DevEnvironment {
  constructor(
    private jobs: Job[],
    private profiles: Record<Profile, string[]>
  ) {}

  private async killPorts(): Promise<void> {
    try {
      console.log('Killing existing processes on development ports...');
      await new Promise<void>((resolve, reject) => {
        const killScript = spawn('scripts/killports.sh');
        
        killScript.stdout.on('data', (data) => {
          console.log(data.toString().trim());
        });
        
        killScript.stderr.on('data', (data) => {
          console.error(data.toString().trim());
        });
        
        killScript.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            console.warn('Warning: killports.sh exited with code', code);
            resolve(); // Still resolve to continue with startup
          }
        });
        
        killScript.on('error', (err) => {
          console.warn('Warning: Failed to execute killports.sh:', err);
          resolve(); // Still resolve to continue with startup
        });
      });
    } catch (error) {
      console.warn('Warning: Port killing failed, some ports might still be in use');
    }
  }

  async run(profileName: string): Promise<void> {
    // Kill ports before starting
    await this.killPorts();

    const jobsToRun = this.profiles[profileName as Profile] || [profileName];
    const selectedJobs = this.jobs.filter(job => jobsToRun.includes(job.name));
    
    const commands = selectedJobs.map(job => {
      if (typeof job.do === 'string' && job.do.includes('npm-run-all')) {
        // Extract the script names from npm-run-all command
        const scripts = job.do.split('--parallel')[1].trim().split(' ');
        // Convert each script to a full npm run command
        return scripts.map(script => ({
          command: `npm run ${script}`,
          name: script,
          env: job.env
        }));
      } else {
        return [{
          command: typeof job.do === 'string' ? job.do : `${job.do.command} ${job.do.args.join(' ')}`,
          name: job.name,
          env: job.env
        }];
      }
    }).flat();
    
    await concurrently(commands);
  }
}

class JobBuilder {
  private cachedAnalysis: Map<string, FileAnalysis> = new Map();
  private srcDir: string;

  constructor(srcDir: string = 'src') {
    this.srcDir = srcDir;
  }

  private async analyzeFile(filePath: string): Promise<FileAnalysis> {
    if (this.cachedAnalysis.has(filePath)) {
      return this.cachedAnalysis.get(filePath)!;
    }

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath);
      let analysis: FileAnalysis = {
        hasWebSocket: false,
        imports: []
      };

      if (ext === '.ts' || ext === '.tsx') {
        analysis = this.analyzeTypeScript(content, filePath);
      } else if (ext === '.py') {
        analysis = await this.analyzePython(content, filePath);
      }

      this.cachedAnalysis.set(filePath, analysis);
      return analysis;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn(`Warning: File not found: ${filePath}`);
        return {
          hasWebSocket: false,
          imports: []
        };
      }
      throw error;
    }
  }

  private analyzeTypeScript(content: string, filePath: string): FileAnalysis {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const analysis: FileAnalysis = {
      hasWebSocket: false,
      imports: []
    };

    function visit(node: ts.Node) {
      if (ts.isImportDeclaration(node)) {
        const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
        analysis.imports.push(importPath);
      }

      // Check for WebSocket usage
      if (ts.isIdentifier(node) && 
          (node.text === 'WebSocket' || node.text.includes('Socket'))) {
        analysis.hasWebSocket = true;
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return analysis;
  }

  private async analyzePython(content: string, filePath: string): Promise<FileAnalysis> {
    const analysis: FileAnalysis = {
      hasWebSocket: false,
      imports: []
    };

    // Simple regex-based analysis for Python
    const importRegex = /^(?:from|import)\s+([^\s]+)/gm;
    const wsRegex = /(?:websocket|WebSocket|socket)/g;
    const stdLibModules = new Set(['os', 'sys', 'pathlib', 'tkinter', 'json', 'time', 'datetime', 'pynput']);

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importName = match[1].split('.')[0]; // Get base module name
      if (!stdLibModules.has(importName)) {
        analysis.imports.push(match[1]);
      }
    }

    analysis.hasWebSocket = wsRegex.test(content);
    return analysis;
  }

  private async getAllDependencies(filePath: string, visited = new Set<string>()): Promise<string[]> {
    if (visited.has(filePath)) return [];
    visited.add(filePath);

    const analysis = await this.analyzeFile(filePath);
    const deps = [...analysis.imports];

    for (const imp of analysis.imports) {
      const resolvedPath = this.resolveImportPath(imp, filePath);
      if (resolvedPath) {
        const subDeps = await this.getAllDependencies(resolvedPath, visited);
        deps.push(...subDeps);
      }
    }

    return [...new Set(deps)];
  }

  private resolveImportPath(importPath: string, currentFile: string): string | null {
    // Add logic to resolve relative and absolute imports
    if (importPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(currentFile), importPath);
      // Only warn if file doesn't exist and it's a local import
      if (!fs.existsSync(resolved)) {
        console.warn(`Warning: Local import not found: ${resolved}`);
      }
      return resolved;
    }
    return path.join(this.srcDir, importPath);
  }

  public async buildJob(filePath: string): Promise<Job> {
    const analysis = await this.analyzeFile(filePath);
    const deps = await this.getAllDependencies(filePath);
    const ext = path.extname(filePath);
    const fileName = path.basename(filePath, ext);

    let command: string;
    let watchPattern: string;

    // Start with watching the main file
    const watchPaths = [filePath];

    // Add Python-specific import handling
    if (ext === '.py') {
      // For each import, check if it exists as a .py file in src directory
      for (const imp of analysis.imports) {
        const possiblePyFile = path.join(this.srcDir, `${imp}.py`);
        if (fs.existsSync(possiblePyFile)) {
          watchPaths.push(possiblePyFile);
        }
      }
    }

    // Build the nodemon command
    if (ext === '.ts' || ext === '.tsx') {
      command = `nodemon`;
      watchPattern = 'ts,tsx';
    } else if (ext === '.py') {
      command = `nodemon`;
      watchPattern = 'py';
    } else {
      command = `nodemon`;
      watchPattern = path.extname(filePath).substring(1);
    }

    // Add watch paths
    command += ' ' + watchPaths.map(p => `--watch ${p}`).join(' ');

    // Add the execution command
    if (ext === '.ts' || ext === '.tsx') {
      command += ` --exec "ts-node ${filePath}"`;
    } else if (ext === '.py') {
      command += ` --exec "python ${filePath}"`;
    } else {
      command += ` --exec "${filePath}"`;
    }

    // Add file extensions to watch
    command += ` -e ${watchPattern}`;

    const job: Job = {
      name: fileName,
      do: command,
      dependencies: [],
    };

    // If file uses WebSocket and isn't server.ts, add server as dependency
    if (analysis.hasWebSocket && !filePath.endsWith('server.ts')) {
      job.dependencies!.push('server');
    }

    return job;
  }

  public async buildJobs(): Promise<Job[]> {
    const jobs: Job[] = [];
    const files = await this.findSourceFiles();
    const requestedFile = process.argv[2];

    if (requestedFile === 'dev') {
      // Special case for 'dev dev' command - run all dev scripts concurrently
      const devScripts = [
        'dev:monitor',
        'dev:server',
        'dev:client',
        'dev:extension',
        // 'dev:messages'
      ];
      
      // Return a separate job for each script to run in parallel
      return devScripts.map(script => ({
        name: script,
        do: `npm run ${script}`,
        dependencies: []
      }));
    }

    if (requestedFile) {
      // If a specific file/profile is requested, only process that
      const matchingFile = files.find(f => path.basename(f, path.extname(f)) === requestedFile);
      if (matchingFile) {
        const job = await this.buildJob(matchingFile);
        jobs.push(job);
      } else {
        // Check if it's a valid profile name
        const isValidProfile = Object.values(Profile).includes(requestedFile as Profile);
        if (!isValidProfile) {
          throw new Error(
            `Could not find file or profile "${requestedFile}"\n` +
            `Available profiles: ${Object.values(Profile).join(', ')}\n` +
            `Available files: ${files.map(f => path.basename(f, path.extname(f))).join(', ')}`
          );
        }
      }
    } else {
      // Process all files only for default profile
      for (const file of files) {
        const job = await this.buildJob(file);
        jobs.push(job);
      }
    }

    return jobs;
  }

  private async findSourceFiles(): Promise<string[]> {
    const files: string[] = [];
    
    async function walk(dir: string) {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else if (['.ts', '.tsx', '.py'].includes(path.extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // Skip if directory doesn't exist
        console.warn(`Warning: Directory ${dir} not found`);
      }
    }

    await walk(this.srcDir);
    return files;
  }

  public async buildProfiles(jobs: Job[]): Promise<Record<Profile, string[]>> {
    const profiles: Record<Profile, string[]> = {
      [Profile.DEFAULT]: [],
      [Profile.REPL]: [],
      [Profile.DEV]: ['dev:monitor', 'dev:server', 'dev:client', 'dev:extension', 'dev:messages'],
      [Profile.WIN]: ['dev:winmonitor', 'dev:extension'],
      [Profile.LLM]: [],
      [Profile.CODE_STORE]: [],
      [Profile.ALL]: jobs.map(job => job.name)
    };

    // Group jobs by type
    const serverJobs = jobs.filter(job => job.name.includes('server'));
    const clientJobs = jobs.filter(job => job.name.includes('client'));
    const monitorJobs = jobs.filter(job => job.name.includes('monitor'));

    profiles[Profile.REPL] = [...serverJobs, ...clientJobs].map(job => job.name);
    // Don't override DEV profile as it's already set correctly above
    profiles[Profile.WIN] = jobs.filter(job => job.name.includes('win')).map(job => job.name);
    profiles[Profile.LLM] = ['server', 'llm'];
    profiles[Profile.CODE_STORE] = ['server', 'codeStore'];

    return profiles;
  }
}

// Usage
async function main() {
  const jobBuilder = new JobBuilder();
  const jobs = await jobBuilder.buildJobs();
  const profiles = await jobBuilder.buildProfiles(jobs);

  const devEnv = new DevEnvironment(jobs, profiles);
  const args = process.argv.slice(2);
  await devEnv.run(args[0] || Profile.DEFAULT);
}

main().catch(console.error);