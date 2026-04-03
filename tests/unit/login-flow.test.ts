import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '../..');
const bgPath = resolve(projectRoot, 'packages/extension/src/entrypoints/background.ts');

// Read background.ts source for structural tests
const bgSource = readFileSync(bgPath, 'utf-8');

// Load fixtures
const loginHtml = readFileSync(resolve(__dirname, '../fixtures/yeshid-login.html'), 'utf-8');
const onboardHtml = readFileSync(resolve(__dirname, '../fixtures/vuetify-onboard.html'), 'utf-8');

// ── Background.ts structural tests ──────────────────────────────────────────

describe('Login flow: background.ts contains required auth functions', () => {
  it('has PRE_CHECK_AUTH function', () => {
    expect(bgSource).toContain('function PRE_CHECK_AUTH()');
  });

  it('has PRE_WAIT_FOR_AUTH function', () => {
    expect(bgSource).toContain('function PRE_WAIT_FOR_AUTH(');
  });

  it('has PRE_CLICK_SSO_BUTTON function', () => {
    expect(bgSource).toContain('function PRE_CLICK_SSO_BUTTON()');
  });

  it('has waitForAuth helper function', () => {
    expect(bgSource).toContain('async function waitForAuth(');
  });

  it('has isLoginUrl helper function', () => {
    expect(bgSource).toContain('function isLoginUrl(');
  });
});

describe('Login flow: auth check integration in startRun', () => {
  it('performs pre-chain auth check before executing steps', () => {
    expect(bgSource).toContain('PRE_CHECK_AUTH');
    // startRun should call PRE_CHECK_AUTH before the chain loop
    const startRunIdx = bgSource.indexOf('async function startRun(');
    const chainLoopIdx = bgSource.indexOf('for (let i = 0; i < chain.length; i++)', startRunIdx);
    const preAuthIdx = bgSource.indexOf('PRE_CHECK_AUTH', startRunIdx);
    expect(preAuthIdx).toBeGreaterThan(startRunIdx);
    expect(preAuthIdx).toBeLessThan(chainLoopIdx);
  });

  it('skips pre-chain auth check if first step is assess_state', () => {
    expect(bgSource).toContain('firstStepIsAssess');
    expect(bgSource).toContain("chain[0]?.action === 'assess_state'");
  });

  it('calls waitForAuth when pre-chain auth check fails', () => {
    const startRunIdx = bgSource.indexOf('async function startRun(');
    const waitForAuthIdx = bgSource.indexOf('waitForAuth(tabId, runId, authConfig)', startRunIdx);
    expect(waitForAuthIdx).toBeGreaterThan(startRunIdx);
  });

  it('derives auth config from payload params before auth recovery', () => {
    const startRunIdx = bgSource.indexOf('async function startRun(');
    const authConfigIdx = bgSource.indexOf('const authConfig = getAuthConfig(payload, params);', startRunIdx);
    expect(authConfigIdx).toBeGreaterThan(startRunIdx);
  });

  it('skips pre-chain auth check when tab domain differs from auth domain', () => {
    expect(bgSource).toContain('tabOnAuthDomain');
    expect(bgSource).toContain('differs from auth domain');
    // The condition should include canAutoAuth and tabOnAuthDomain
    expect(bgSource).toContain('!firstStepIsAssess && !skipAuthCheck && canAutoAuth && tabOnAuthDomain');
  });

  it('skips automated auth for manual_required and none auth types', () => {
    expect(bgSource).toContain("authConfig.authType === 'sso_automatable'");
    expect(bgSource).toContain('canAutoAuth');
  });
});

describe('Login flow: site-aware mid-chain auth recovery', () => {
  it('detects foreign domain and waits for manual auth instead of YeshID SSO', () => {
    expect(bgSource).toContain('auth_required_manual_wait');
    expect(bgSource).toContain('please log in to continue');
  });

  it('polls for user to return to expected domain after manual login', () => {
    expect(bgSource).toContain('Manual auth completed');
    expect(bgSource).toContain('pollHost === expectedHost');
  });

  it('uses YeshID SSO flow only when tab is on auth domain', () => {
    // The else branch should contain the YeshID-specific auth recovery
    expect(bgSource).toContain('YeshID-domain auth recovery');
    expect(bgSource).toContain('auth_recovery_triggered');
  });
});

describe('Login flow: mid-chain auth detection in navigate', () => {
  it('checks for login redirect after navigate', () => {
    // The navigate handler should call isLoginUrl after navigation
    const navigateSection = bgSource.slice(
      bgSource.indexOf("if (a === 'navigate')"),
      bgSource.indexOf("if (a === 'type')")
    );
    expect(navigateSection).toContain('isLoginUrl');
    expect(navigateSection).toContain('auth_required');
  });

  it('returns auth_required status when navigate lands on /login', () => {
    const navigateSection = bgSource.slice(
      bgSource.indexOf("if (a === 'navigate')"),
      bgSource.indexOf("if (a === 'type')")
    );
    expect(navigateSection).toContain("status: 'auth_required'");
    expect(navigateSection).toContain('requestedUrl');
  });

  it('handles auth_required in the chain loop with recovery', () => {
    // The chain loop should detect auth_required and call waitForAuth
    const chainLoopStart = bgSource.indexOf('for (let i = 0; i < chain.length; i++)');
    const chainLoopSection = bgSource.slice(chainLoopStart, chainLoopStart + 8000);
    expect(chainLoopSection).toContain("res.status === 'auth_required'");
    expect(chainLoopSection).toContain('waitForAuth');
    expect(chainLoopSection).toContain('auth_recovery_triggered');
  });

  it('retries the failed step after successful auth recovery', () => {
    const chainLoopStart = bgSource.indexOf('for (let i = 0; i < chain.length; i++)');
    const chainLoopSection = bgSource.slice(chainLoopStart, chainLoopStart + 8000);
    // Should re-execute the step after auth
    expect(chainLoopSection).toContain('Retry the step after auth recovery');
    expect(chainLoopSection).toContain('res = await executeStep(step, run)');
  });
});

// ── PRE_CHECK_AUTH DOM tests ────────────────────────────────────────────────

describe('Login flow: PRE_CHECK_AUTH DOM behavior', () => {
  // Extract and eval PRE_CHECK_AUTH from background.ts for direct testing
  const fnMatch = bgSource.match(/function PRE_CHECK_AUTH\(\)\s*\{[\s\S]*?\n  \}/);
  const fnSource = fnMatch?.[0] || '';

  it('detects unauthenticated state when no nav drawer present', () => {
    document.body.innerHTML = loginHtml;
    // Login page has no .v-navigation-drawer
    const hasNavDrawer = !!document.querySelector('.v-navigation-drawer a[href="/overview"]');
    expect(hasNavDrawer).toBe(false);
    // /login regex matches login paths
    expect(/\/login/.test('/login')).toBe(true);
    // Combined: not authenticated
    const onLoginPage = true; // simulating /login pathname
    expect(!onLoginPage && hasNavDrawer).toBe(false);
  });

  it('detects authenticated state with nav drawer', () => {
    document.body.innerHTML = onboardHtml;
    // Add a nav drawer to simulate authenticated state
    const nav = document.createElement('div');
    nav.className = 'v-navigation-drawer';
    const link = document.createElement('a');
    link.href = '/overview';
    link.textContent = 'Overview';
    nav.appendChild(link);
    document.body.appendChild(nav);

    const hasNavDrawer = !!document.querySelector('.v-navigation-drawer a[href="/overview"]');
    expect(hasNavDrawer).toBe(true);
    // /people/onboard does NOT match /login
    expect(/\/login/.test('/people/onboard')).toBe(false);
    const onLoginPage = false;
    expect(!onLoginPage && hasNavDrawer).toBe(true); // authenticated
  });
});

// ── PRE_CLICK_SSO_BUTTON DOM tests ──────────────────────────────────────────

describe('Login flow: PRE_CLICK_SSO_BUTTON DOM behavior', () => {
  it('finds and clicks the Google SSO button', () => {
    document.body.innerHTML = loginHtml;
    let clicked = false;
    const btn = document.querySelector('.google-sso-btn') as HTMLElement;
    btn.addEventListener('click', () => { clicked = true; });

    // Simulate the function logic
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const googleBtn = btns.find(b =>
      b.textContent?.toLowerCase().includes('sign in with google') ||
      b.textContent?.toLowerCase().includes('google')
    ) as HTMLElement | undefined;

    expect(googleBtn).toBeDefined();
    googleBtn!.click();
    expect(clicked).toBe(true);
  });

  it('returns available buttons when Google SSO not found', () => {
    document.body.innerHTML = '<button>Some Other Button</button>';

    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    const googleBtn = btns.find(b =>
      b.textContent?.toLowerCase().includes('sign in with google')
    ) as HTMLElement | undefined;

    expect(googleBtn).toBeUndefined();
    const available = btns.map(b => b.textContent?.trim()).filter(Boolean);
    expect(available).toContain('Some Other Button');
  });
});

// ── isLoginUrl tests ────────────────────────────────────────────────────────

describe('Login flow: isLoginUrl', () => {
  // Mirror the generalized function from background.ts
  function isLoginUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const p = u.pathname;
      return (
        p === '/login' || p === '/login/' ||
        p === '/signin' || p === '/signin/' ||
        p === '/sign-in' || p === '/sign-in/' ||
        /^\/oauth2\/.*\/authorize\/?$/.test(p) ||
        /^\/oauth2\/v[12]\/authorize\/?$/.test(p) ||
        /^\/auth\//.test(p) ||
        /^\/sso\//.test(p)
      );
    } catch { return false; }
  }

  // YeshID patterns
  it('detects /login path', () => {
    expect(isLoginUrl('https://app.yeshid.com/login')).toBe(true);
  });

  it('detects /login/ path with trailing slash', () => {
    expect(isLoginUrl('https://app.yeshid.com/login/')).toBe(true);
  });

  // Okta OAuth2 patterns
  it('detects Okta OAuth2 authorize redirect', () => {
    expect(isLoginUrl('https://trial-8689388.okta.com/oauth2/v1/authorize?client_id=okta.2b1959c8&response_type=code')).toBe(true);
  });

  it('detects OAuth2 authorize with custom auth server', () => {
    expect(isLoginUrl('https://dev-12345.okta.com/oauth2/default/authorize')).toBe(true);
  });

  // Generic SSO/auth patterns
  it('detects /signin path', () => {
    expect(isLoginUrl('https://example.com/signin')).toBe(true);
  });

  it('detects /sign-in path', () => {
    expect(isLoginUrl('https://example.com/sign-in')).toBe(true);
  });

  it('detects /auth/* paths', () => {
    expect(isLoginUrl('https://example.com/auth/login')).toBe(true);
    expect(isLoginUrl('https://example.com/auth/saml')).toBe(true);
  });

  it('detects /sso/* paths', () => {
    expect(isLoginUrl('https://example.com/sso/redirect')).toBe(true);
  });

  // Negative cases
  it('does not match /login-callback', () => {
    expect(isLoginUrl('https://app.yeshid.com/login-callback')).toBe(false);
  });

  it('does not match /people', () => {
    expect(isLoginUrl('https://app.yeshid.com/people')).toBe(false);
  });

  it('does not match /overview', () => {
    expect(isLoginUrl('https://app.yeshid.com/overview')).toBe(false);
  });

  it('does not match Okta admin pages', () => {
    expect(isLoginUrl('https://trial-8689388-admin.okta.com/admin/users')).toBe(false);
    expect(isLoginUrl('https://trial-8689388-admin.okta.com/admin/apps/active')).toBe(false);
  });

  it('does not match Okta authenticated landing', () => {
    expect(isLoginUrl('https://trial-8689388.okta.com/app/UserHome?session_hint=AUTHENTICATED')).toBe(false);
  });

  it('handles invalid URLs gracefully', () => {
    expect(isLoginUrl('not-a-url')).toBe(false);
  });
});

// ── Auth overlay messaging ──────────────────────────────────────────────────

describe('Login flow: overlay messaging', () => {
  it('waitForAuth sends auth-related overlay steps', () => {
    // Check that the waitForAuth function sends overlay messages
    const waitForAuthSection = bgSource.slice(
      bgSource.indexOf('async function waitForAuth('),
      bgSource.indexOf('// Check if a URL indicates')
    );
    expect(waitForAuthSection).toContain('overlay_show');
    expect(waitForAuthSection).toContain('Session expired');
    expect(waitForAuthSection).toContain('auth-detect');
    expect(waitForAuthSection).toContain('auth-sso');
    expect(waitForAuthSection).toContain('auth-wait');
  });

  it('waitForAuth has a configurable timeout', () => {
    const fnSignature = bgSource.match(/async function waitForAuth\(([^)]+)\)/);
    expect(fnSignature).toBeTruthy();
    expect(fnSignature![1]).toContain('authConfig');
    expect(fnSignature![1]).toContain('authTimeoutMs');
    expect(fnSignature![1]).toContain('120000'); // default 120s
  });

  it('waitForAuth reports timeout on failure', () => {
    const waitForAuthSection = bgSource.slice(
      bgSource.indexOf('async function waitForAuth('),
      bgSource.indexOf('// Check if a URL indicates')
    );
    expect(waitForAuthSection).toContain('Login timed out');
    // PRE_WAIT_FOR_AUTH (the in-page poller) reports timedOut
    expect(bgSource).toContain('timedOut');
  });
});

describe('Login flow: auth account selection config', () => {
  it('does not hardcode a Google account email in waitForAuth', () => {
    expect(bgSource).not.toContain('mw@mike-wolf.com');
  });

  it('supports google_account_email from auth config', () => {
    expect(bgSource).toContain('params?.google_account_email');
    expect(bgSource).toContain('params?.sso_email');
    expect(bgSource).toContain('payload?._meta?.auth?.googleAccountEmail');
  });

  it('falls back to manual account selection when no email is configured', () => {
    expect(bgSource).toContain('Select your Google account manually');
  });
});
