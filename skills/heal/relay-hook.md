# Relay Hook for HEAL Events

## Option A — Direct relay modification (preferred for production)
In the relay's step execution handler, after N failed retries, add:

```typescript
// After maxRetries exceeded for a step:
await publishHealEvent({
  channel: 'yeshie/payload/broken',
  payload: {
    siteId: payload.siteId,
    payloadId: payload.id,
    stepId: step.id,
    selector: step.cachedSelector,
    error: failureReason, // 'selector_not_found' | 'timeout' | 'wrong_element'
    perceiveSnapshot: await perceive(tabId).catch(() => null),
    retryCount: maxRetries,
    timestamp: new Date().toISOString()
  }
});
```

## Option B — External monitor (works without relay modification)
Run `heal-monitor.js` as a sidecar process alongside the relay. It polls `/chat/logs` for step_failed events and publishes to the HEAL queue.

See `heal-monitor.js` for the sidecar implementation.
