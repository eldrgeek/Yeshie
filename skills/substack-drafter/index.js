#!/usr/bin/env node
/**
 * substack-drafter/index.js — entry point
 *
 * Usage:
 *   node index.js --story /path/to/story.md
 *   node index.js --story cattle-baron   (resolves from SOMA/state/wolfinpc-pending/)
 *   node index.js --all                  (draft all NOT_PUBLISHED stories in the pending dir)
 *
 * Prerequisites:
 *   Run auth.js login once to cache credentials.
 *   Stories must be staged in ~/Projects/SOMA/state/wolfinpc-pending/ with substack_status: NOT_PUBLISHED
 */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PENDING_DIR = path.join(
  process.env.HOME,
  "Projects/SOMA/state/wolfinpc-pending"
);
const LOG_FILE = path.join(PENDING_DIR, "draft-log.jsonl");
const SKILL_DIR = __dirname;

function run(cmd, args = []) {
  const result = spawnSync(process.execPath, [path.join(SKILL_DIR, cmd), ...args], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split("\n")) {
    const [key, ...vals] = line.split(": ");
    if (key) meta[key.trim()] = vals.join(": ").replace(/^"(.*)"$/, "$1");
  }
  return meta;
}

function updateFrontmatter(filePath, updates) {
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    if (content.includes(`${key}:`)) {
      content = content.replace(new RegExp(`^${key}:.*$`, "m"), `${key}: ${value}`);
    } else {
      content = content.replace(/^---\n/, `---\n${key}: ${value}\n`);
    }
  }
  fs.writeFileSync(filePath, content);
}

function appendLog(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ...entry, createdAt: new Date().toISOString() }) + "\n");
}

async function draftStory(storyPath) {
  const content = fs.readFileSync(storyPath, "utf8");
  const meta = parseYamlFrontmatter(content);

  if (meta.substack_status === "DRAFTED") {
    console.log(`  Already drafted: ${path.basename(storyPath)} → ${meta.substack_draft_url}`);
    return { skipped: true };
  }

  if (meta.substack_status === "PUBLISHED") {
    console.log(`  Already published: ${path.basename(storyPath)}`);
    return { skipped: true };
  }

  const title = meta.suggested_title || path.basename(storyPath, ".md");
  console.log(`  Creating draft: "${title}"...`);

  // Write body-only temp file for draft.js
  const body = content.replace(/^---[\s\S]*?---\n/, "").trim();
  const tmpFile = path.join(PENDING_DIR, `.tmp-${path.basename(storyPath)}`);
  fs.writeFileSync(tmpFile, body);

  let output;
  try {
    output = run("draft.js", ["create", "--title", title, "--body", tmpFile]);
    fs.unlinkSync(tmpFile);
  } catch (err) {
    fs.existsSync(tmpFile) && fs.unlinkSync(tmpFile);
    throw err;
  }

  const result = JSON.parse(output);
  if (!result.success) throw new Error(result.error || "Unknown draft error");

  // Update frontmatter and log
  updateFrontmatter(storyPath, {
    substack_status: "DRAFTED",
    substack_draft_url: result.draftUrl,
    substack_draft_id: result.draftId,
  });
  appendLog({ slug: path.basename(storyPath, ".md"), ...result });

  console.log(`  ✓ Draft created: ${result.draftUrl}`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);

  // Check auth first
  try {
    run("auth.js", ["check"]);
  } catch (_) {
    console.error("Not authenticated. Run: node auth.js login");
    process.exit(1);
  }

  const allFlag = args.includes("--all");
  const storyArg = args[args.indexOf("--story") + 1];

  let stories = [];
  if (allFlag) {
    stories = fs
      .readdirSync(PENDING_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => path.join(PENDING_DIR, f))
      .filter((p) => {
        const meta = parseYamlFrontmatter(fs.readFileSync(p, "utf8"));
        return meta.substack_status === "NOT_PUBLISHED";
      });
    console.log(`Found ${stories.length} unpublished stories to draft.`);
  } else if (storyArg) {
    const resolved = storyArg.endsWith(".md")
      ? storyArg
      : path.join(PENDING_DIR, storyArg + ".md");
    if (!fs.existsSync(resolved)) {
      console.error(`Story not found: ${resolved}`);
      process.exit(1);
    }
    stories = [resolved];
  } else {
    console.error("Usage: index.js --story <slug|path> | --all");
    process.exit(1);
  }

  let drafted = 0;
  let skipped = 0;
  let errors = 0;

  for (const storyPath of stories) {
    console.log(`\n[${path.basename(storyPath)}]`);
    try {
      const result = await draftStory(storyPath);
      if (result.skipped) skipped++;
      else drafted++;
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nSummary: ${drafted} drafted, ${skipped} skipped, ${errors} errors`);
  process.exit(errors > 0 ? 1 : 0);
}

main();
