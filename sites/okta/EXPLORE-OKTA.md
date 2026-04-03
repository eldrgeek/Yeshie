# Okta Site Exploration Guide

## Quick Start

You have three options to explore Okta using Yeshie's systematic approach:

### Option 1: Browser Console (Fastest)

1. **Open your Okta admin tab** (https://trial-8689388-admin.okta.com/admin/*)
2. **Open browser DevTools**: `Cmd+Option+I` (Mac) or `F12` (Windows/Linux)
3. **Click the Console tab**
4. **Copy the entire contents** of `/sessions/wonderful-upbeat-meitner/mnt/Projects/yeshie/sites/okta/execute-exploration.js`
5. **Paste into the console** and press Enter
6. Wait for the exploration to complete (30-60 seconds)
7. You'll see a table with results summary
8. Copy the results: In console, run:
   ```javascript
   copy(JSON.stringify(window.__okta_exploration_results__, null, 2))
   ```
9. **Paste into** `/sessions/wonderful-upbeat-meitner/mnt/Projects/yeshie/sites/okta/exploration-results.json`

### Option 2: Automated via Yeshie Runtime

Once we get Claude in Chrome connected, we can inject the full payload:
```javascript
window.__yeshie__.execute(payload, {
  onChainComplete: (result) => {
    // Save result to exploration-results.json
  }
});
```

### Option 3: Navigate Manually & Tell Me What You See

Navigate through Okta pages and describe:
- Page URLs and titles
- Main sections in the sidebar
- User management interface
- Application management
- API/token configuration

---

## What We're Exploring

The exploration script will capture:

### 1. **Page Context**
- Page title, URL, Okta version
- Helps identify framework and version

### 2. **Interactive Elements** (buttons, links, inputs)
- Text labels
- ARIA attributes
- Data test IDs
- Classes and types
- Foundation for semantic resolution

### 3. **Navigation Structure**
- Sidebar/menu items
- Links and organization
- Enables state graph building

### 4. **Tables & Data Grids**
- Column headers
- Row count
- Identifies user/group/app management pages

### 5. **Form Inputs**
- Labels (via `<label>`, placeholder, aria-label)
- Input types
- Required fields
- Foundation for input resolution strategies

### 6. **Framework Detection**
- Vuetify, Material-UI, Bootstrap, custom React
- Determines which Layer 2 patterns apply

### 7. **Button Tooltips**
- Discovered via hover
- Provides semantic annotations for UI elements

---

## After Exploration

Once results are in `exploration-results.json`, I will:

1. **Update site.model.json** with discovered states and transitions
2. **Populate abstractTargets** with actual selectors from the exploration
3. **Create initial task payloads** for:
   - `00-login.payload.json` — Okta authentication
   - `01-user-add.payload.json` — Create users
   - `02-user-delete.payload.json` — Deactivate users
   - `05-integration-setup.payload.json` — SCIM configuration
4. **Identify framework-specific patterns** (Layer 2)
5. **Test payloads** against the live instance

---

## Interpreting Results

### Framework Detection
If you see:
- `vuetify: true` → Okta uses Vuetify, we can reuse YeshID patterns
- `materialUi: true` → Create Layer 2 Material-UI patterns
- `okta: true` → Okta has custom framework, analyze closely
- `customData: true` → Okta uses data-test-id attributes, good for selector stability

### Navigation Items
Look for:
- "Dashboard" or "Home"
- "People" or "Users" or "Directory"
- "Applications" or "Apps"
- "Security" section
- "Provisioning" or "Identity Sync"
- "API" or "Tokens"

### Form Labels
Example structure:
```
"First Name": input-v-123
"Last Name": input-v-124
"Email": input-v-125
```
If labels follow a pattern (especially Vuetify), we can use semantic resolution.

---

## Troubleshooting

**Script fails to run:**
- Make sure you're on Okta admin page (URL contains `/admin/`)
- Check that JavaScript is enabled
- Try refreshing page first

**Missing interactive elements:**
- Some elements might be hidden/lazy-loaded
- That's okay — we focus on the visible page
- Further payloads will discover modal/dialog elements

**Framework not detected:**
- Okta might use a completely custom framework
- We'll infer patterns from the HTML structure
- Create custom `models/generic-okta.model.json` if needed

---

## Next Steps

After you run the exploration and I receive the results:

1. **Build Okta site model** with discovered states
2. **Create task payloads** using Vuetify or Okta-specific patterns
3. **Test payloads** interactively
4. **Refine selectors** through the self-improvement loop

The goal: by end of this session, you'll have working Okta automation equivalent to YeshID.
