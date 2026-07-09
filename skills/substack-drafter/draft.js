#!/usr/bin/env node
/**
 * substack-drafter/draft.js
 * Creates a Substack draft post.
 *
 * Commands:
 *   draft.js create --title "Story Title" --body /path/to/body.md [--publication wolfinpc]
 *
 * Reads session from ~/.config/substack-drafter/session.json (run auth.js login first).
 * DRAFTS ONLY — never publishes.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const CONFIG_DIR = path.join(process.env.HOME, ".config", "substack-drafter");
const SESSION_FILE = path.join(CONFIG_DIR, "session.json");

function loadSession() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    if (raw.expiresAt && Date.now() > raw.expiresAt) {
      throw new Error("Session expired. Run: auth.js login");
    }
    return raw;
  } catch (err) {
    throw new Error(`No valid session: ${err.message}. Run: auth.js login`);
  }
}

function markdownToSubstackBody(markdown) {
  // Minimal conversion: Substack's draft API accepts HTML body.
  // Convert markdown paragraphs to <p> tags.
  const lines = markdown.split("\n");
  const paragraphs = [];
  let current = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
    } else {
      // Strip markdown formatting for Substack HTML
      let l = line.trim();
      l = l.replace(/^#{1,3}\s+/, ""); // headings → plain
      l = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      l = l.replace(/\*(.+?)\*/g, "<em>$1</em>");
      l = l.replace(/---/g, "—");
      current.push(l);
    }
  }
  if (current.length > 0) paragraphs.push(current.join(" ").trim());

  return paragraphs.map((p) => `<p>${p}</p>`).join("\n");
}

async function apiPost(hostname, pathname, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname,
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Cookie: `substack.sid=${token}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, data }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] !== "create") {
    console.error("Usage: draft.js create --title TITLE --body BODY_FILE [--publication PUB]");
    process.exit(1);
  }

  const titleIdx = args.indexOf("--title");
  const bodyIdx = args.indexOf("--body");
  const pubIdx = args.indexOf("--publication");

  if (titleIdx < 0 || bodyIdx < 0) {
    console.error("ERROR: --title and --body are required");
    process.exit(1);
  }

  const title = args[titleIdx + 1];
  const bodyFile = args[bodyIdx + 1];
  const publication = pubIdx >= 0 ? args[pubIdx + 1] : "wolfinpc";

  if (!fs.existsSync(bodyFile)) {
    console.error(`ERROR: Body file not found: ${bodyFile}`);
    process.exit(1);
  }

  const session = loadSession();
  const markdownBody = fs.readFileSync(bodyFile, "utf8");

  // Strip YAML frontmatter if present
  const bodyWithoutFrontmatter = markdownBody.replace(/^---[\s\S]*?---\n/, "").trim();
  const htmlBody = markdownToSubstackBody(bodyWithoutFrontmatter);

  const hostname = `${publication}.substack.com`;
  console.log(`Creating draft on ${hostname}: "${title}"`);

  // Substack draft API endpoint
  const result = await apiPost(hostname, "/api/v1/drafts", {
    draft_title: title,
    draft_body: htmlBody,
    draft_subtitle: "",
    draft_podcast_url: "",
    draft_podcast_preview_upload_id: null,
    draft_podcast_duration: null,
    draft_podcast_preview_start_time: null,
    draft_section_id: null,
    audience: "everyone",
    is_free: true,
    // draft_type ensures it's a post draft, not a podcast
    type: "newsletter",
  }, session.token);

  if (result.status !== 200) {
    console.error(`API error: HTTP ${result.status}\n${result.data.slice(0, 300)}`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(result.data);
  } catch (_) {
    console.error("Unexpected response: " + result.data.slice(0, 200));
    process.exit(1);
  }

  const draftId = parsed.id || parsed.draft_id;
  const draftUrl = `https://${hostname}/p/${parsed.slug || draftId}`;

  console.log(JSON.stringify({ success: true, draftId, draftUrl, title }));
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
