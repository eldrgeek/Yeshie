import { readFileSync, existsSync, accessSync, constants } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

describe('Listener system prompt (listener.md)', () => {
  const promptPath = resolve(projectRoot, 'prompts/listener.md');

  it('exists and is non-empty', () => {
    expect(existsSync(promptPath)).toBe(true);
    const content = readFileSync(promptPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('mentions yeshie_listen and yeshie_respond tools', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toContain('yeshie_listen');
    expect(content).toContain('yeshie_respond');
  });

  it('defines ANSWER, DO, and TEACH modes', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toContain('ANSWER');
    expect(content).toContain('DO');
    expect(content).toContain('TEACH');
  });

  it('references at least 3 article titles from docs-kb.json', () => {
    const content = readFileSync(promptPath, 'utf-8');
    const kbPath = resolve(projectRoot, 'scripts/docs-kb.json');
    const kb = JSON.parse(readFileSync(kbPath, 'utf-8'));
    const titles = kb.articles.map((a: any) => a.title);
    let matchCount = 0;
    for (const title of titles) {
      if (content.includes(title)) matchCount++;
    }
    expect(matchCount).toBeGreaterThanOrEqual(3);
  });

  it('is a substantial system prompt (> 500 words)', () => {
    const content = readFileSync(promptPath, 'utf-8');
    const wordCount = content.split(/\s+/).length;
    expect(wordCount).toBeGreaterThan(500);
  });
});

describe('Listener startup script (yeshie-listen.sh)', () => {
  const scriptPath = resolve(projectRoot, 'scripts/yeshie-listen.sh');

  it('exists and starts with bash shebang', () => {
    expect(existsSync(scriptPath)).toBe(true);
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('contains relay health check', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('localhost:3333');
    expect(content).toContain('curl');
  });

  it('invokes claude command', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('CLAUDE_BIN');
    expect(content).toContain('system-prompt');
  });

  it('passes bash syntax check', () => {
    const result = execSync(`bash -n "${scriptPath}" 2>&1`, { encoding: 'utf-8' });
    // If bash -n succeeds, it returns empty string
    expect(result.trim()).toBe('');
  });
});

describe('Listener watchdog + service', () => {
  const watchScriptPath = resolve(projectRoot, 'scripts/yeshie-listener-watch.sh');
  const plistPath = resolve(projectRoot, 'scripts/com.yeshie.listener.plist');

  it('watch script exists and passes bash syntax check', () => {
    expect(existsSync(watchScriptPath)).toBe(true);
    const result = execSync(`bash -n "${watchScriptPath}" 2>&1`, { encoding: 'utf-8' });
    expect(result.trim()).toBe('');
  });

  it('watch script health-checks relay chat status', () => {
    const content = readFileSync(watchScriptPath, 'utf-8');
    expect(content).toContain('/chat/status');
    expect(content).toContain('listenerConnected');
    expect(content).toContain('relay reports listener offline');
  });

  it('launchd plist exists and runs the watcher with KeepAlive', () => {
    expect(existsSync(plistPath)).toBe(true);
    const content = readFileSync(plistPath, 'utf-8');
    expect(content).toContain('com.yeshie.listener');
    expect(content).toContain('yeshie-listener-watch.sh');
    expect(content).toContain('<key>KeepAlive</key>');
    expect(content).toContain('<true/>');
  });
});
