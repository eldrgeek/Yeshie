// heal-queue.js — Concurrent heal queue manager
// Ensures at most one heal per payload file, queues subsequent broken events

export class HealQueue {
  constructor(maxDepth = 10, ttlMs = 30 * 60 * 1000) {
    this.active = new Map();   // payloadId → { startedAt, correlationId }
    this.queue = new Map();    // payloadId → [{ event, queuedAt }]
    this.maxDepth = maxDepth;
    this.ttlMs = ttlMs;
  }

  // Returns: 'process' | 'queued' | 'dropped'
  enqueue(payloadId, event) {
    // Prune expired queue entries
    const now = Date.now();
    for (const [id, entries] of this.queue.entries()) {
      const fresh = entries.filter(e => now - e.queuedAt < this.ttlMs);
      if (fresh.length === 0) this.queue.delete(id);
      else this.queue.set(id, fresh);
    }

    if (!this.active.has(payloadId)) {
      this.active.set(payloadId, { startedAt: now, event });
      return 'process';
    }

    const q = this.queue.get(payloadId) || [];
    if (q.length >= this.maxDepth) return 'dropped';
    q.push({ event, queuedAt: now });
    this.queue.set(payloadId, q);
    return 'queued';
  }

  complete(payloadId) {
    this.active.delete(payloadId);
    const q = this.queue.get(payloadId) || [];
    if (q.length > 0) {
      const next = q.shift();
      this.queue.set(payloadId, q);
      this.active.set(payloadId, { startedAt: Date.now(), event: next.event });
      return next.event;
    }
    return null;
  }

  status() {
    return {
      active: Object.fromEntries(this.active),
      queued: Object.fromEntries([...this.queue.entries()].map(([k,v]) => [k, v.length]))
    };
  }
}
