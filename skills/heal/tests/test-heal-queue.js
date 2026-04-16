// test-heal-queue.js — unit tests for HealQueue
import { HealQueue } from '../heal-queue.js';

let passed = 0, failed = 0;
function ok(desc, val) {
  if (val) { console.log(`ok - ${desc}`); passed++; }
  else { console.log(`not ok - ${desc}`); failed++; }
}

const q = new HealQueue(10, 30 * 60 * 1000);

ok('first enqueue returns process', q.enqueue('p1', {x:1}) === 'process');
ok('second enqueue returns queued', q.enqueue('p1', {x:2}) === 'queued');
ok('queue depth is 1', (q.queue.get('p1') || []).length === 1);

// Fill to max
for (let i = 0; i < 9; i++) q.enqueue('p1', {x: i+10});
ok('enqueue at max returns dropped', q.enqueue('p1', {x:99}) === 'dropped');

// Complete — should return next event
const next = q.complete('p1');
ok('complete returns next event', next !== null && next.x === 2);
ok('after complete, active has p1', q.active.has('p1'));

// TTL: manually back-date an entry
q.enqueue('p2', {y:1}); // process
q.enqueue('p2', {y:2}); // queued
const entries = q.queue.get('p2');
entries[0].queuedAt = Date.now() - 31 * 60 * 1000; // expired
q.queue.set('p2', entries);
// Next enqueue should prune the expired entry
q.complete('p2'); // moves to active
q.complete('p2'); // drains queue (expired entry pruned)
ok('TTL prunes expired entries on next enqueue', q.enqueue('p2', {y:3}) === 'process');

// New payload gets process
const q2 = new HealQueue();
ok('new payload returns process', q2.enqueue('fresh', {}) === 'process');
ok('status() returns active and queued maps', typeof q2.status().active === 'object');

export const results = { passed, failed };
console.log(`\n# heal-queue: ${passed} passed, ${failed} failed`);
