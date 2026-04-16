---
type: reference
project: yeshie
created: 2026-04-15
tags: [yeshid, selectors, vuetify, playwright, automation]
---

# YeshID Selector Stability Tiers

YeshID has zero `data-testid` attributes — it uses Vuetify with dynamic classes. Selector stability tiers for YeshID (best to worst):

1. `aria-label` — most stable
2. `name` attribute
3. stable class (non-Vuetify)
4. `id`
5. `:has-text()` polyfill (requires `resolveSelector()` in extension) — last resort

Never rely on Vuetify-generated class names like `v-field__input` without a fallback chain.
