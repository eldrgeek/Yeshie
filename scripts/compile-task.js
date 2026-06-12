#!/usr/bin/env node
// scripts/compile-task.js — NL task → executable Yeshie payload
// Uses claude -p to compile a natural-language task into a payload JSON
// that can be POSTed to the relay's /run endpoint.
//
// Usage:
//   node scripts/compile-task.js <site-model.json> "<NL task string>" [output.payload.json]
//
// Env:
//   CLAUDE_MODEL — model to use (default: claude-sonnet-4-6)

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';

// ── ISA excerpt — key actions Claude needs to know ─────────────────────────
const ISA_EXCERPT = {
  actions: [
    { name: 'navigate', fields: ['url'], note: 'Navigate to absolute URL. Always wait for page load.' },
    { name: 'delay', fields: ['ms'], note: 'Wait N milliseconds.' },
    { name: 'read', fields: ['store_as'], note: 'Full page snapshot when no selector given. Returns {headings,inputs,buttons,links,tables,navLinks}.' },
    { name: 'click', fields: ['selector'], note: 'Click element by CSS selector. Use stable selectors: IDs, aria-labels, semantic text-based selectors. Example: {"action":"click","selector":"button.btn-primary"}' },
    { name: 'type', fields: ['selector', 'value', 'method'], note: 'Type into input. selector is a CSS selector string. method: set_value for native inputs. Example: {"action":"type","selector":"#username","value":"admin","method":"set_value"}' },
    { name: 'wait_for', fields: ['selector', 'state', 'timeout'], note: 'Wait for element matching CSS selector. state: visible|enabled.' },
    { name: 'assert', fields: ['selector', 'value'], note: 'Assert element text equals value.' },
    { name: 'js', fields: ['code', 'store_as'], note: 'Run DOM query. Use for complex patterns like finding a table row.' },
  ],
  selectorNote: 'For type and click: use "selector" field (CSS selector string), NOT target.match.fallbackSelectors. Examples: "#username", "button.btn-primary", "input[placeholder=\'Search\']"',
  chainMeta: {
    _meta: {
      task: 'example-task',
      mode: 'exploratory',
    },
    note: 'mode should be exploratory for new sites.',
  },
};

// ── Compile a NL task to payload ──────────────────────────────────────────
async function compile(siteModelPath, taskDescription, outputPath) {
  // Load site model
  const siteModel = JSON.parse(readFileSync(siteModelPath, 'utf8'));

  // Build a compact site model excerpt for the prompt
  const meta = siteModel._meta ?? {};
  const pages = siteModel.explorationRaw ?? [];
  const pageExcerpt = pages.map(p => ({
    path: p.path,
    discoveredAs: p.discoveredAs,
    headings: p.headings?.slice(0, 2),
    inputs: p.forms?.slice(0, 5).map(f => `${f.id ?? f.label} (${f.type})`),
    buttons: (siteModel.stateGraph?.nodes?.[p.path?.replace(/\//g, '-').replace(/^-/, '') || 'root'] ? null : null),
    // Use targetRegistry entries for this page
    targets: Object.entries(siteModel.targetRegistry ?? {})
      .filter(([k]) => k.startsWith((p.path?.replace(/\//g, '-').replace(/^-/, '')) ?? ''))
      .slice(0, 8)
      .map(([k, v]) => ({ key: k, type: v.type, description: v.description, selectors: v.fallbackSelectors })),
  }));

  const siteExcerpt = {
    site: meta.site,
    baseUrl: meta.baseUrl,
    framework: meta.framework,
    auth: siteModel.auth,
    pagesDiscovered: pages.length,
    pages: pageExcerpt,
    urlSchema: siteModel.urlSchema?.slice(0, 10),
  };

  const prompt = `You are a Yeshie payload compiler. Given a site model and a task description, output a valid Yeshie payload JSON.

## Site Model Excerpt
${JSON.stringify(siteExcerpt, null, 2)}

## Yeshie ISA (the actions you can use)
${JSON.stringify(ISA_EXCERPT, null, 2)}

## Task to Compile
"${taskDescription}"

## Instructions
1. Produce a valid Yeshie payload JSON with _meta and chain fields.
2. chain is an array of steps. Each step has: stepId (s1, s2, ...), action, and action-specific fields.
3. Use fallbackSelectors with STABLE selectors: IDs (#id), semantic attributes (aria-label, placeholder), or semantic text. Avoid brittle bundler-generated class names.
4. For login/auth: include steps to fill the login form using the auth info from the site model.
5. For read tasks: use "read" steps with store_as and an "assert" or return-value step at the end to capture the answer. Store the answer in a variable named "answer".
6. For write tasks: include navigation to the right page, form filling, and submission. Include a verification step to confirm success (e.g., read a success message or navigate back and search).
7. The payload should be in exploratory mode (every step reports back).
8. Output ONLY the JSON — no markdown, no explanation, no code fences.

## Output Format
{
  "_meta": { "task": "<slug>", "description": "<one-line description>", "mode": "exploratory" },
  "chain": [
    { "stepId": "s1", "action": "...", ... },
    ...
  ]
}`;

  // Shell out to claude -p
  console.log(`[compile] Calling claude -p (model: ${MODEL}) ...`);
  const claudeCmd = `claude -p ${JSON.stringify(prompt)} --model ${MODEL} --output-format text 2>/dev/null`;

  let output;
  try {
    output = execSync(claudeCmd, { maxBuffer: 4 * 1024 * 1024, timeout: 120_000 }).toString().trim();
  } catch (err) {
    throw new Error(`claude -p failed: ${err.message}`);
  }

  // Strip markdown fences and any preamble text before the JSON object
  let jsonStr = output;
  // Remove code fences
  jsonStr = jsonStr.replace(/^```(?:json)?\r?\n?/m, '').replace(/\r?\n?```\s*$/m, '');
  // Find first '{' in case there's preamble text
  const firstBrace = jsonStr.indexOf('{');
  if (firstBrace > 0) jsonStr = jsonStr.slice(firstBrace);
  // Find last '}' to trim any trailing text
  const lastBrace = jsonStr.lastIndexOf('}');
  if (lastBrace >= 0) jsonStr = jsonStr.slice(0, lastBrace + 1);
  jsonStr = jsonStr.trim();

  let payload;
  try {
    payload = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err.message}\n\nOutput:\n${output.slice(0, 500)}`);
  }

  // Validate basic structure
  if (!payload.chain || !Array.isArray(payload.chain)) {
    throw new Error('Payload missing chain array');
  }
  if (!payload._meta) {
    payload._meta = { task: 'compiled', mode: 'exploratory' };
  }

  // Write output
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    console.log(`[compile] Payload written to ${outputPath}`);
  } else {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  }

  return payload;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/compile-task.js <site-model.json> "<task>" [output.json]');
  process.exit(1);
}

const [siteModelPath, taskDescription, outputPath] = args;

compile(siteModelPath, taskDescription, outputPath).then(payload => {
  console.log(`[compile] Done — ${payload.chain.length} steps`);
}).catch(err => {
  console.error('[compile] Fatal:', err.message);
  process.exit(1);
});
