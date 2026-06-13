# gist.github.com

Gist is a separate origin from github.com. Key differences:

- **Origin**: `https://gist.github.com` (not `https://github.com`)
- **base_url**: Always use `https://gist.github.com` in payload params
- **Auth**: Public gists require no auth. Private gists share the GitHub session cookie.
- **Extension coverage**: The extension's `<all_urls>` host_permissions already covers this origin — no additional manifest change needed.

## Pattern for other GitHub subdomains

Any new GitHub subdomain (e.g., `education.github.com`, `copilot.github.com`) follows the same pattern:
1. Create `sites/<subdomain>.github.com/site.model.json` with correct `base_url`
2. Set `_meta.subdomain_of: "github.com"` for documentation
3. Use the subdomain-specific `base_url` in payloads — do NOT reuse the github.com model

The tab auto-discovery in `background.ts` (startRun) already handles this: when `base_url` is `github.com`, it queries `https://*.github.com/*` to find subdomain tabs as fallback.
