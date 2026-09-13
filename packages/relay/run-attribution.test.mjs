import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunRequestedConversationEntry } from './run-attribution.js';

test('valid traceparent is parsed and logged', () => {
  const entry = buildRunRequestedConversationEntry({
    headers: {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      'x-agent-program': 'cursor',
      'x-agent-seat': 'cursor-worker',
      'x-agent-task': 'relay-trace-attribution',
      'x-on-behalf-of': 'mike',
    },
    commandId: 'cmd-123',
    route: '/run/async',
    payload: {
      site: 'chatgpt.com',
      _meta: { task: 'submit-prompt' },
    },
    params: { prompt: 'hello' },
    tabId: 42,
  });

  assert.equal(entry.event, 'run_requested');
  assert.equal(entry.jobId, 'cmd-123');
  assert.equal(entry.commandId, 'cmd-123');
  assert.equal(entry.route, '/run/async');
  assert.equal(entry.trace, '4bf92f3577b34da6a3ce929d0e0e4736');
  assert.equal(entry.span, '00f067aa0ba902b7');
  assert.equal(entry.program, 'cursor');
  assert.equal(entry.seat, 'cursor-worker');
  assert.equal(entry.task, 'relay-trace-attribution');
  assert.equal(entry.on_behalf_of, 'mike');
  assert.equal(entry.site, 'chatgpt.com');
  assert.equal(entry.recipe, 'submit-prompt');
  assert.deepEqual(entry.param_names, ['prompt']);
  assert.equal(entry.tabId, 42);
});

test('malformed traceparent is dropped', () => {
  const entry = buildRunRequestedConversationEntry({
    headers: { traceparent: 'not-a-trace' },
    commandId: 'cmd-123',
    route: '/run',
    payload: { site: 'claude.ai', _meta: { task: 'open-project' } },
    params: {},
    tabId: 9,
  });

  assert.equal(entry.trace, undefined);
  assert.equal(entry.span, undefined);
  assert.equal(entry.requester, 'unattributed');
});

test('missing traceparent marks run as unattributed', () => {
  const entry = buildRunRequestedConversationEntry({
    headers: {},
    commandId: 'cmd-123',
    route: '/run',
    payload: {
      _meta: { id: 'import-users-csv', baseUrl: 'https://app.yeshid.com' },
    },
    params: {},
    tabId: '7',
  });

  assert.equal(entry.requester, 'unattributed');
  assert.equal(entry.site, 'app.yeshid.com');
  assert.equal(entry.recipe, 'import-users-csv');
});

test('param values are never logged', () => {
  const sentinel = 'S3CRET-SHOULD-NEVER-APPEAR';
  const entry = buildRunRequestedConversationEntry({
    headers: {},
    commandId: 'cmd-123',
    route: '/run',
    payload: {
      site: 'chatgpt.com',
      _meta: { task: 'submit-prompt' },
      chain: [{ stepId: 's1', action: 'type', value: sentinel }],
    },
    params: { prompt: sentinel, account_password: sentinel },
    tabId: 11,
  });

  assert.deepEqual(entry.param_names, ['prompt', 'account_password']);
  assert.equal(JSON.stringify(entry).includes(sentinel), false);
});
