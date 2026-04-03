// Yeshie Okta Site Exploration Script
// Paste this into the browser console on any Okta admin page to gather site intelligence

(async function exploreOkta() {
  console.log('🔍 Starting Okta site exploration...');

  const results = {
    timestamp: new Date().toISOString(),
    exploredUrl: window.location.href,
    pageContext: null,
    interactiveElements: null,
    navigationStructure: null,
    tableStructures: null,
    buttonTooltips: null,
    pageHeadings: null,
    frameworkSigns: null,
    pageSnapshots: null
  };

  // 1. Capture page context
  results.pageContext = {
    pageTitle: document.title,
    baseUrl: window.location.origin,
    pathname: window.location.pathname,
    oktaVersion: document.querySelector('[data-okta-version]')?.getAttribute('data-okta-version') || 'unknown',
    userAgent: navigator.userAgent.substring(0, 100)
  };
  console.log('✓ Page context captured');

  // 2. Get interactive elements
  const interactiveEls = Array.from(document.querySelectorAll('button, [role="button"], a[href], input, select, textarea, [contenteditable]')).slice(0, 100);
  results.interactiveElements = interactiveEls.map(el => ({
    tag: el.tagName,
    text: el.textContent?.trim().substring(0, 50) || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    ariaRole: el.getAttribute('role') || '',
    dataTestId: el.getAttribute('data-test-id') || '',
    dataQa: el.getAttribute('data-qa') || '',
    id: el.id || '',
    className: el.className?.substring(0, 150) || '',
    type: el.type || el.getAttribute('type') || '',
    placeholder: el.placeholder || ''
  }));
  console.log(`✓ Found ${results.interactiveElements.length} interactive elements`);

  // 3. Extract navigation
  const nav = document.querySelector('nav, [role="navigation"], .sidebar, .okta-sidenav, .left-nav');
  if (nav) {
    const navItems = Array.from(nav.querySelectorAll('a, button, [role="button"], li')).map(el => ({
      tag: el.tagName,
      text: el.textContent?.trim().substring(0, 50) || '',
      href: el.getAttribute('href') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      className: el.className?.substring(0, 100) || ''
    }));
    results.navigationStructure = {
      found: true,
      itemCount: navItems.length,
      items: navItems
    };
    console.log(`✓ Navigation extracted (${navItems.length} items)`);
  } else {
    results.navigationStructure = { found: false };
    console.log('⚠ Navigation not found');
  }

  // 4. Detect tables/grids
  const tables = Array.from(document.querySelectorAll('table, [role="grid"], [role="table"], [class*="table"], [class*="data-table"]'));
  results.tableStructures = tables.map(table => ({
    tag: table.tagName,
    className: table.className?.substring(0, 100) || '',
    headers: Array.from(table.querySelectorAll('[role="columnheader"], th')).map(h => h.textContent?.trim()),
    rowCount: Array.from(table.querySelectorAll('[role="row"], tbody tr')).length,
    firstRowText: Array.from(table.querySelectorAll('[role="row"], tbody tr'))[0]?.textContent?.trim().substring(0, 100) || ''
  }));
  console.log(`✓ Found ${results.tableStructures.length} tables/grids`);

  // 5. Probe button tooltips
  const buttons = Array.from(document.querySelectorAll('button[title], button[aria-label], [role="button"][title]')).slice(0, 20);
  results.buttonTooltips = buttons.map(btn => ({
    text: btn.textContent?.trim().substring(0, 40) || '',
    title: btn.getAttribute('title') || '',
    ariaLabel: btn.getAttribute('aria-label') || ''
  }));
  console.log(`✓ Captured ${results.buttonTooltips.length} button tooltips`);

  // 6. Extract page headings
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"]')).slice(0, 15);
  results.pageHeadings = headings.map(h => ({
    level: h.tagName || `aria-level-${h.getAttribute('aria-level')}`,
    text: h.textContent?.trim(),
    className: h.className?.substring(0, 100)
  }));
  console.log(`✓ Extracted ${results.pageHeadings.length} headings`);

  // 7. Detect UI framework
  results.frameworkSigns = {
    vuetify: !!document.querySelector('.v-app, [class*="v-"]'),
    materialUi: !!document.querySelector('[class*="MuiButton"], [class*="MuiContainer"]'),
    bootstrap: !!document.querySelector('.container, .navbar, .btn-primary'),
    okta: !!document.querySelector('[class*="okta"], [data-okta-"]'),
    react: !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || !!window.React,
    angular: !!window.ng || !!document.querySelector('[ng-app], [ng-controller]'),
    customData: !!document.querySelector('[data-test-id], [data-qa]')
  };
  console.log('✓ Framework detection complete');

  // 8. Capture current page snapshot
  results.pageSnapshots = {
    currentUrl: window.location.href,
    currentTitle: document.title,
    mainHeading: document.querySelector('h1, [role="heading"][aria-level="1"]')?.textContent?.trim() || 'unknown',
    isAuthPage: !!document.querySelector('[class*="login"], [class*="signin"], [class*="auth"]'),
    isAdminPage: window.location.pathname.includes('/admin/')
  };
  console.log('✓ Page snapshot captured');

  // 9. Identify form inputs by label
  const inputs = Array.from(document.querySelectorAll('input, textarea, select'));
  const inputsByLabel = inputs.map(inp => {
    const label = document.querySelector(`label[for="${inp.id}"]`)?.textContent?.trim() ||
                  inp.placeholder ||
                  inp.getAttribute('aria-label') ||
                  inp.getAttribute('aria-labelledby') ||
                  inp.name ||
                  '';
    return {
      type: inp.type || inp.tagName,
      label: label.substring(0, 50),
      name: inp.name || '',
      required: inp.required || inp.getAttribute('aria-required') || false
    };
  });
  results.formInputs = inputsByLabel;
  console.log(`✓ Found ${inputsByLabel.length} form inputs`);

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('📊 EXPLORATION COMPLETE');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('Results summary:');
  console.table({
    'Interactive Elements': results.interactiveElements.length,
    'Navigation Items': results.navigationStructure.found ? results.navigationStructure.itemCount : 0,
    'Tables Found': results.tableStructures.length,
    'Form Inputs': results.formInputs.length,
    'Page Headings': results.pageHeadings.length,
    'Framework Detected': Object.entries(results.frameworkSigns).filter(([k, v]) => v).map(([k]) => k).join(', ') || 'unknown'
  });

  console.log('');
  console.log('Full results object:');
  console.log(results);

  console.log('');
  console.log('To save results, copy and paste this in console:');
  console.log('copy(JSON.stringify(results, null, 2))');

  // Make results globally accessible
  window.__okta_exploration_results__ = results;
  console.log('');
  console.log('✓ Results stored in window.__okta_exploration_results__');
  console.log('✓ You can now copy and paste the JSON into exploration-results.json');

  return results;
})();
