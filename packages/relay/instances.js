// Instance registry, target resolution and tab leases for the relay.
//
// An "instance" is one Yeshie extension running in one Chrome profile. Many
// instances stay connected at once; every job resolves to exactly one of them or
// is refused. The worst outcome of a wrong route is acting as the wrong Google
// account, so the resolver never guesses: zero matches and multiple matches are
// both refusals that name the candidates. Design: docs/design/multi-connection-relay.md

export const DEFAULT_PROFILE = 'mw@mike-wolf.com';
export const DEFAULT_PROFILE_LABELS = {
  'mw@mike-wolf.com': 'Default',
  'claude@mike-wolf.com': 'Profile 3',
};

function lc(v) { return typeof v === 'string' ? v.trim().toLowerCase() : ''; }

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
}

export function siteMatches(url, site) {
  const want = lc(site).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const h = hostOf(url);
  if (!want || !h) return false;
  return h === want || h.endsWith('.' + want);
}

// Normalize a request's routing fields into one target object. A bare string is
// a profile; the legacy top-level tabId fills target.tabId when absent.
export function normalizeTarget(target, legacyTabId) {
  let t = {};
  if (typeof target === 'string' && target.trim()) t = { profile: target.trim() };
  else if (target && typeof target === 'object' && !Array.isArray(target)) t = { ...target };
  if (t.tabId === undefined && legacyTabId !== undefined && legacyTabId !== null && legacyTabId !== '') t.tabId = legacyTabId;
  for (const k of ['tabId', 'windowId']) {
    if (t[k] !== undefined && t[k] !== null) {
      const n = Number(t[k]);
      t[k] = Number.isInteger(n) ? n : t[k];
    }
  }
  for (const k of Object.keys(t)) if (t[k] === undefined || t[k] === null || t[k] === '') delete t[k];
  return t;
}

export function createInstanceRegistry(opts = {}) {
  const defaultProfile = lc(opts.defaultProfile || process.env.YESHIE_DEFAULT_PROFILE || DEFAULT_PROFILE);
  let labels = { ...DEFAULT_PROFILE_LABELS };
  try { if (process.env.YESHIE_PROFILE_LABELS) labels = { ...labels, ...JSON.parse(process.env.YESHIE_PROFILE_LABELS) }; } catch { /* keep defaults */ }
  if (opts.profileLabels) labels = { ...labels, ...opts.profileLabels };
  const labelFor = (email) => {
    const e = lc(email);
    for (const [k, v] of Object.entries(labels)) if (lc(k) === e) return v;
    return null;
  };

  const instances = new Map();      // instanceId -> instance
  const bySocketId = new Map();     // socket.id -> instanceId
  const leases = new Map();         // `${instanceId}:${tabId}` -> { jobId, instanceId, tabId, since }

  function register(socket, auth = {}) {
    const instanceId = (typeof auth.instanceId === 'string' && auth.instanceId.trim()) ? auth.instanceId.trim() : `legacy:${socket.id}`;
    const legacy = instanceId.startsWith('legacy:');
    const p = (auth.profile && typeof auth.profile === 'object') ? auth.profile : {};
    const email = typeof p.email === 'string' && p.email ? p.email : null;
    const label = (typeof p.label === 'string' && p.label) ? p.label : (labelFor(email) || email || null);
    const prev = instances.get(instanceId);
    const instance = {
      instanceId,
      legacy,
      socket,
      profile: { email, label, gaiaId: p.gaiaId || null },
      version: auth.buildVersion || auth.version || null,
      windows: prev?.windows ?? null,
      tabs: prev?.tabs ?? null,       // null = never reported (legacy build)
      connectedAt: new Date().toISOString(),
      stateAt: prev?.stateAt ?? null,
    };
    instances.set(instanceId, instance);
    bySocketId.set(socket.id, instanceId);
    const superseded = (prev && prev.socket && prev.socket.id !== socket.id) ? prev.socket : null;
    if (superseded) bySocketId.delete(superseded.id);
    return { instance, superseded };
  }

  // Remove the instance only if this socket is still its current socket (a
  // superseded socket's late disconnect must not evict its replacement).
  function unregister(socket) {
    const id = bySocketId.get(socket.id);
    bySocketId.delete(socket.id);
    if (!id) return null;
    const inst = instances.get(id);
    if (!inst || inst.socket.id !== socket.id) return null;
    instances.delete(id);
    for (const [k, l] of leases) if (l.instanceId === id) leases.delete(k);
    return inst;
  }

  function bySocket(socket) {
    const id = bySocketId.get(socket.id);
    return id ? instances.get(id) || null : null;
  }

  function updateState(socket, state = {}) {
    const inst = bySocket(socket);
    if (!inst) return null;
    const windows = Array.isArray(state.windows) ? state.windows.map(w => ({
      windowId: w.windowId, focused: !!w.focused, type: w.type || null, incognito: !!w.incognito,
    })) : [];
    const tabs = Array.isArray(state.tabs) ? state.tabs.map(t => ({
      tabId: t.tabId, windowId: t.windowId, url: t.url || '', title: t.title || '', active: !!t.active,
    })) : [];
    inst.windows = windows;
    inst.tabs = tabs;
    inst.stateAt = new Date().toISOString();
    return inst;
  }

  function profileMatches(inst, want) {
    const w = lc(want);
    return !!w && (lc(inst.profile.email) === w || lc(inst.profile.label) === w || lc(inst.instanceId) === w);
  }

  function describe(inst) {
    return {
      instanceId: inst.instanceId,
      profile: inst.profile.label || inst.profile.email || 'unknown',
      email: inst.profile.email,
      version: inst.version,
    };
  }

  function isDefault(inst) {
    return (!!inst.profile.email && lc(inst.profile.email) === defaultProfile)
      || lc(inst.profile.label) === 'default'
      || (!!inst.profile.label && lc(inst.profile.label) === defaultProfile);
  }

  function refuse(code, error, extra = {}) {
    return { ok: false, code, error, connected: [...instances.values()].map(describe), ...extra };
  }

  // Resolve a normalized target to { ok, instance, tabId|null } or a refusal.
  function resolve(target = {}) {
    const all = [...instances.values()];
    if (all.length === 0) return { ok: false, code: 'not_connected', error: 'Extension not connected', connected: [] };

    const hasTabSel = target.tabId !== undefined || target.windowId !== undefined || !!target.url || !!target.site;
    let cands = all;
    if (target.instanceId) {
      cands = cands.filter(i => i.instanceId === target.instanceId);
      if (!cands.length) return refuse('target_not_found', `No connected instance has instanceId ${target.instanceId}.`);
    }
    if (target.profile) {
      cands = cands.filter(i => profileMatches(i, target.profile));
      if (!cands.length) return refuse('target_not_found', `No connected instance belongs to profile "${target.profile}".`);
    }

    if (!target.instanceId && !target.profile && !hasTabSel) {
      const defaults = all.filter(isDefault);
      if (defaults.length === 1) return { ok: true, instance: defaults[0], tabId: null, via: 'default_profile' };
      if (defaults.length > 1) {
        return refuse('ambiguous_target', `${defaults.length} connected instances match the default profile ${defaultProfile}; name an instanceId.`, { candidates: defaults.map(describe) });
      }
      if (all.length === 1 && all[0].legacy && !all[0].profile.email && !all[0].profile.label) {
        return { ok: true, instance: all[0], tabId: null, via: 'legacy_single_instance', legacyFallback: true };
      }
      return refuse('default_profile_not_connected', `No target was given, and the default profile ${defaultProfile} is not connected. Name a target profile; the relay will not run the job as another account.`);
    }

    if (!hasTabSel) {
      if (cands.length === 1) return { ok: true, instance: cands[0], tabId: null, via: 'profile' };
      return refuse('ambiguous_target', `${cands.length} connected instances match that target; name an instanceId.`, { candidates: cands.map(describe) });
    }

    // Tab-level selectors: exactly one tab across the candidate instances.
    const matches = [];
    for (const inst of cands) {
      if (!Array.isArray(inst.tabs)) continue;
      let tabs = inst.tabs;
      if (target.windowId !== undefined) tabs = tabs.filter(t => t.windowId === target.windowId);
      if (target.tabId !== undefined) tabs = tabs.filter(t => t.tabId === target.tabId);
      if (target.site) tabs = tabs.filter(t => siteMatches(t.url, target.site));
      if (target.url) tabs = tabs.filter(t => (t.url || '').includes(target.url));
      if (target.windowId !== undefined && target.tabId === undefined && !target.site && !target.url) {
        tabs = tabs.filter(t => t.active);
      }
      for (const t of tabs) matches.push({ inst, tab: t });
    }
    if (matches.length === 1) return { ok: true, instance: matches[0].inst, tabId: matches[0].tab.tabId, via: 'tab' };
    if (matches.length > 1) {
      return refuse('ambiguous_target', `${matches.length} tabs match that target${new Set(matches.map(m => m.inst.instanceId)).size > 1 ? ' across different profiles' : ''}; name a profile and tabId.`, {
        candidates: matches.map(m => ({ ...describe(m.inst), tabId: m.tab.tabId, windowId: m.tab.windowId, url: m.tab.url, title: m.tab.title })),
      });
    }
    // Legacy compatibility: a single candidate that has never reported tabs is
    // trusted with an explicit tabId (it cannot be checked, but there is no
    // other instance it could belong to).
    if (target.tabId !== undefined && cands.length === 1 && !Array.isArray(cands[0].tabs)) {
      return { ok: true, instance: cands[0], tabId: target.tabId, via: 'legacy_unverified_tab' };
    }
    return refuse('target_not_found', `No connected tab matches ${JSON.stringify(target)}.`);
  }

  const leaseKey = (instanceId, tabId) => `${instanceId}:${tabId}`;

  function acquireLease(instanceId, tabId, jobId) {
    const k = leaseKey(instanceId, tabId);
    const cur = leases.get(k);
    if (cur && cur.jobId !== jobId) {
      return { ok: false, code: 'tab_leased', error: `Tab ${tabId} is leased by job ${cur.jobId} (since ${cur.since}).`, heldBy: cur.jobId };
    }
    if (!cur) leases.set(k, { jobId, instanceId, tabId, since: new Date().toISOString() });
    return { ok: true };
  }

  function releaseJob(jobId) {
    for (const [k, l] of leases) if (l.jobId === jobId) leases.delete(k);
  }

  function list() {
    return {
      defaultProfile,
      instances: [...instances.values()].map(i => ({
        ...describe(i),
        label: i.profile.label,
        legacy: i.legacy,
        isDefault: isDefault(i),
        socketId: i.socket.id,
        connectedAt: i.connectedAt,
        stateAt: i.stateAt,
        windows: i.windows,
        tabs: i.tabs,
      })),
      leases: [...leases.values()],
    };
  }

  return {
    register, unregister, bySocket, updateState, resolve, acquireLease, releaseJob, list,
    get size() { return instances.size; },
    all: () => [...instances.values()],
    defaultInstance: () => [...instances.values()].find(isDefault) || null,
    leaseCount: () => leases.size,
  };
}
