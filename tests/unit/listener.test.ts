import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');

describe('Base listener system prompt (base-listener.md)', () => {
  const promptPath = resolve(projectRoot, 'prompts/base-listener.md');

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

  it('defines EXPLAIN, DO, and SHOW modes', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toContain('EXPLAIN');
    expect(content).toContain('DO');
    expect(content).toContain('SHOW');
  });

  it('is a substantial system prompt (> 300 words)', () => {
    const content = readFileSync(promptPath, 'utf-8');
    const wordCount = content.split(/\s+/).length;
    expect(wordCount).toBeGreaterThan(300);
  });

  it('does NOT contain YeshID-specific content (site separation enforced)', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).not.toContain('app.yeshid.com');
    expect(content).not.toContain('.v-navigation-drawer');
    expect(content).not.toContain('01-user-add.payload.json');
    expect(content).not.toContain('docs.yeshid.com');
  });

  it('mentions site-context block for site-specific content', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toContain('site-context');
  });

  it('includes escalation instructions referencing claude_code', () => {
    const content = readFileSync(promptPath, 'utf-8');
    expect(content).toContain('claude_code');
    expect(content).toContain('Escalation');
  });
});

describe('YeshID site context file', () => {
  const sitePath = resolve(projectRoot, 'prompts/sites/app.yeshid.com.md');

  it('exists', () => {
    expect(existsSync(sitePath)).toBe(true);
  });

  it('is wrapped in <site-context> tags with correct domain', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain('<site-context domain="app.yeshid.com">');
    expect(content).toContain('</site-context>');
  });

  it('contains yeshie_run and YeshID payload filenames', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain('yeshie_run');
    expect(content).toContain('01-user-add.payload.json');
    expect(content).toContain('02-user-delete.payload.json');
  });

  it('references at least 3 article titles from docs-kb.json', () => {
    const content = readFileSync(sitePath, 'utf-8');
    const kbPath = resolve(projectRoot, 'scripts/docs-kb.json');
    const kb = JSON.parse(readFileSync(kbPath, 'utf-8'));
    const titles = kb.articles.map((a: any) => a.title);
    let matchCount = 0;
    for (const title of titles) {
      if (content.includes(title)) matchCount++;
    }
    expect(matchCount).toBeGreaterThanOrEqual(3);
  });

  it('contains YeshID Vuetify DOM patterns', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain('.v-navigation-drawer');
    expect(content).toContain('Vuetify');
  });
});

describe('Okta site context file', () => {
  const sitePath = resolve(projectRoot, 'prompts/sites/trial-8689388.okta.com.md');

  it('exists', () => {
    expect(existsSync(sitePath)).toBe(true);
  });

  it('is wrapped in <site-context> tags with correct domain', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain('<site-context domain="trial-8689388.okta.com">');
    expect(content).toContain('</site-context>');
  });

  it('declares manual_required auth type', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain('manual_required');
  });

  it('does NOT reference YeshID payloads', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).not.toContain('01-user-add.payload.json');
    expect(content).not.toContain('app.yeshid.com');
  });
});

describe('Google Admin site context file', () => {
  const sitePath = resolve(projectRoot, 'prompts/sites/admin.google.com.md');

  it('exists', () => {
    expect(existsSync(sitePath)).toBe(true);
  });

  it('is wrapped in <site-context> tags with correct domain', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain('<site-context domain="admin.google.com">');
    expect(content).toContain('</site-context>');
  });

  it('declares manual_required auth type', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain('manual_required');
  });

  it('mentions the correct read selector for Google Admin', () => {
    const content = readFileSync(sitePath, 'utf-8');
    expect(content).toContain("[role='main']");
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

  it('uses base-listener.md (not the deprecated listener.md)', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('base-listener.md');
    expect(content).not.toContain('"$(cat prompts/listener.md)"');
  });

  it('uses Haiku model', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('claude-haiku');
  });

  it('includes claude_code in allowedTools for escalation', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('claude_code');
  });

  it('concatenates site context files from prompts/sites/', () => {
    const content = readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('prompts/sites');
  });

  it('passes bash syntax check', () => {
    const result = execSync(`bash -n "${scriptPath}" 2>&1`, { encoding: 'utf-8' });
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

describe('Extension endpoint config', () => {
  const bgPath = resolve(projectRoot, 'packages/extension/src/entrypoints/background.ts');

  it('reads relay and watcher endpoints from WXT env vars with localhost defaults', () => {
    const content = readFileSync(bgPath, 'utf-8');
    expect(content).toContain('import.meta.env.WXT_RELAY_URL');
    expect(content).toContain('import.meta.env.WXT_WATCHER_URL');
    expect(content).toContain("|| 'http://localhost:3333'");
    expect(content).toContain("|| 'http://localhost:27182'");
  });

  it('builds chat endpoint URLs from the relay base URL', () => {
    const content = readFileSync(bgPath, 'utf-8');
    expect(content).toContain('const CHAT_URL = `${RELAY_URL}/chat`;');
    expect(content).toContain('const CHAT_FEEDBACK_URL = `${RELAY_URL}/chat/feedback`;');
    expect(content).toContain('const CHAT_STATUS_URL = `${RELAY_URL}/chat/status`;');
  });
});
