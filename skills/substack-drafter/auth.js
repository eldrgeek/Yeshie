#!/usr/bin/env node
/**
 * substack-drafter/auth.js
 * Manages Substack session authentication.
 *
 * Commands:
 *   auth.js check               — exits 0 if cached session is valid, 1 if not
 *   auth.js login               — interactive login (reads creds from env/file)
 *   auth.js login --email E --password P
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const CONFIG_DIR = path.join(process.env.HOME, ".config", "substack-drafter");
const SESSION_FILE = path.join(CONFIG_DIR, "session.json");
const CREDS_FILE = path.join(CONFIG_DIR, "creds.json");

function loadSession() {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    if (raw.expiresAt && Date.now() < raw.expiresAt) return raw;
  } catch (_) {}
  return null;
}

function saveSession(data) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ ...data, savedAt: Date.now() }, null, 2));
}

function loadCreds(args) {
  const emailIdx = args.indexOf("--email");
  const passIdx = args.indexOf("--password");
  const email = emailIdx >= 0 ? args[emailIdx + 1] : (process.env.SUBSTACK_EMAIL || null);
  const password = passIdx >= 0 ? args[passIdx + 1] : (process.env.SUBSTACK_PASSWORD || null);
  if (email && password) return { email, password };
  try {
    return JSON.parse(fs.readFileSync(CREDS_FILE, "utf8"));
  } catch (_) {}
  return null;
}

async function substackPost(pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "substack.com",
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const cookies = res.headers["set-cookie"] || [];
        resolve({ status: res.status || res.statusCode, data, cookies });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "check") {
    const session = loadSession();
    if (session) {
      console.log(JSON.stringify({ valid: true, email: session.email }));
      process.exit(0);
    } else {
      console.error("No valid cached session. Run: auth.js login");
      process.exit(1);
    }
  }

  if (command === "login") {
    const creds = loadCreds(args);
    if (!creds) {
      console.error(
        "ERROR: No credentials found.\n" +
        "Provide via --email/--password flags, SUBSTACK_EMAIL/SUBSTACK_PASSWORD env vars,\n" +
        `or save to ${CREDS_FILE} as {\"email\":\"...\",\"password\":\"...\"}`
      );
      process.exit(1);
    }

    console.log(`Logging in as ${creds.email}...`);
    const result = await substackPost("/api/v1/login", {
      email: creds.email,
      password: creds.password,
      captcha_response: null,
    });

    if (result.status !== 200) {
      console.error(`Login failed: HTTP ${result.status}\n${result.data.slice(0, 300)}`);
      process.exit(1);
    }

    let parsed;
    try {
      parsed = JSON.parse(result.data);
    } catch (_) {
      console.error("Unexpected response: " + result.data.slice(0, 200));
      process.exit(1);
    }

    // Extract session token from cookies or response body
    const sessionCookie = result.cookies.find((c) => c.startsWith("substack.sid="));
    const token = sessionCookie ? sessionCookie.split(";")[0].split("=")[1] : null;

    if (!token && !parsed.token) {
      console.error("Login succeeded but no session token found in response.");
      process.exit(1);
    }

    saveSession({
      email: creds.email,
      token: token || parsed.token,
      userId: parsed.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log(JSON.stringify({ success: true, email: creds.email }));
    process.exit(0);
  }

  console.error(`Unknown command: ${command}. Use: check | login`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
