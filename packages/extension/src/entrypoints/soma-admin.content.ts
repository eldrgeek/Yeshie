// content-main.ts — MAIN-world half of the SOMA admin-identity bridge.
//
// Sets window.__somaAdminToken so the soma-feedback widget can include it as
// `adminToken` in its POST body (the VPS feedback-svc constant-time-compares it
// against SOMA_ADMIN_TOKEN to recognize Mike as a site-admin with no login).
//
// WHY a MAIN-world content script instead of an injected inline <script>:
// the previous approach (content.ts creating a <script> tag with .textContent)
// runs as a PAGE inline script and is therefore blocked by the page's own CSP
// ("Executing inline script violates ... script-src 'self' ...") on any site
// with a strict script-src. A content script declared world:'MAIN' is injected
// by the extension itself, NOT as a page <script> tag, so it is exempt from the
// page CSP — same exemption the background's chrome.scripting world:'MAIN'
// injections rely on. runAt document_start sets the global before page/widget
// scripts read it.
//
// Token value comes from WXT_SOMA_ADMIN_TOKEN in packages/extension/.env
// (gitignored, never committed) and is inlined into this bundle at build time.
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    const token = import.meta.env.WXT_SOMA_ADMIN_TOKEN;
    if (token) {
      try {
        (window as any).__somaAdminToken = token;
      } catch {
        /* page froze window or blocked the write — nothing we can do, ignore */
      }
    }
  },
});
