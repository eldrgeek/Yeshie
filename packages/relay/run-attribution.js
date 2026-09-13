const MAX_ATTRIBUTION_STRING_LENGTH = 200;
const TRACEPARENT_RE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

function capString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_ATTRIBUTION_STRING_LENGTH);
}

function readHeader(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const raw = headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return capString(value);
}

function parseTraceparent(traceparentHeader) {
  const traceparent = capString(traceparentHeader);
  if (!traceparent) return null;
  const match = traceparent.match(TRACEPARENT_RE);
  if (!match) return null;
  const [, traceId, spanId] = match;
  // W3C traceparent forbids all-zero trace and span IDs.
  if (/^0{32}$/i.test(traceId) || /^0{16}$/i.test(spanId)) return null;
  return { trace: traceId.toLowerCase(), span: spanId.toLowerCase() };
}

function parseSiteHost(raw) {
  const value = capString(raw);
  if (!value) return undefined;
  if (value.startsWith('/')) return undefined;
  const asUrl = value.includes('://') ? value : `https://${value}`;
  try {
    return capString(new URL(asUrl).hostname);
  } catch {
    return undefined;
  }
}

function firstDefined(values) {
  for (const value of values) {
    if (value !== undefined) return value;
  }
  return undefined;
}

function extractSite(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const meta = (payload._meta && typeof payload._meta === 'object' && !Array.isArray(payload._meta))
    ? payload._meta
    : {};
  const params = (payload.params && typeof payload.params === 'object' && !Array.isArray(payload.params))
    ? payload.params
    : {};
  return firstDefined([
    capString(payload.site),
    capString(meta.site),
    parseSiteHost(params.base_url),
    parseSiteHost(params.baseUrl),
    parseSiteHost(meta.base_url),
    parseSiteHost(meta.baseUrl),
  ]);
}

function extractRecipe(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const meta = (payload._meta && typeof payload._meta === 'object' && !Array.isArray(payload._meta))
    ? payload._meta
    : {};
  return firstDefined([
    capString(meta.task),
    capString(meta.name),
    capString(meta.id),
    capString(meta.title),
    capString(payload.runId),
  ]);
}

function extractParamNames(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return [];
  return Object.keys(params).map((key) => key.slice(0, MAX_ATTRIBUTION_STRING_LENGTH));
}

function sanitizeTabId(tabId) {
  if (typeof tabId === 'number' && Number.isFinite(tabId)) return tabId;
  if (typeof tabId === 'string') return tabId.slice(0, MAX_ATTRIBUTION_STRING_LENGTH);
  return undefined;
}

export function buildRunRequestedConversationEntry({
  headers,
  commandId,
  route,
  payload,
  params,
  tabId,
}) {
  const traceHeader = readHeader(headers, 'traceparent');
  const traceData = parseTraceparent(traceHeader);
  const program = readHeader(headers, 'x-agent-program');
  const seat = readHeader(headers, 'x-agent-seat');
  const task = readHeader(headers, 'x-agent-task');
  const onBehalfOf = readHeader(headers, 'x-on-behalf-of');
  const trace = traceData?.trace;
  const span = traceData?.span;
  const requester = trace ? (seat || program || 'attributed') : 'unattributed';

  return {
    event: 'run_requested',
    jobId: capString(commandId),
    commandId: capString(commandId),
    route: capString(route),
    trace,
    span,
    program,
    seat,
    task,
    on_behalf_of: onBehalfOf,
    requester,
    site: extractSite(payload),
    recipe: extractRecipe(payload),
    param_names: extractParamNames(params),
    tabId: sanitizeTabId(tabId),
  };
}
