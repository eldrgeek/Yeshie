# Yeshie — Active Inference for Web Automation

## The Core Idea

Yeshie treats web automation as a perception-action problem, not a scripting problem.

An agent that has never seen a website faces the same challenge as any organism in a new environment: it must perceive, predict, act, and update its model of the world based on what actually happens. The first encounter is slow and uncertain. With experience, the agent builds an increasingly accurate generative model of the site, and its actions become fast and confident.

This is active inference applied to the web. The agent maintains a hierarchical generative model — beliefs about what it will see and what its actions will cause — and every interaction either confirms those beliefs or forces an update. Surprise (prediction error) is the learning signal. The goal is to minimize surprise over time, which means building a model so good that the agent can predict every page state, every element location, and every response to its actions before they happen.

## The Generative Model

The agent's model of a website is hierarchical. Each layer encodes prior beliefs that constrain the layers below it. The layers fall along two independent axes — how things are built (framework) and what things are for (site type) — which combine to produce strong predictions even on first encounter.

**Layer 1 — Web priors.** General knowledge about how websites work. HTML has structure. Forms have inputs. Buttons trigger actions. Navigation changes URLs. Tables have rows. ARIA attributes carry semantic meaning. These priors are so universal that they apply to any website the agent will ever encounter. They change only when the web platform itself changes.

In the codebase this is `models/runtime.model.json` — the instruction set architecture. It tells the agent what kinds of actions exist, what kinds of signals to look for, and what resolution strategies to try when locating an element. It's the agent's embodied knowledge of what "interacting with a website" even means.

**Layer 2a — Framework priors.** Knowledge about a particular UI framework's patterns. Vuetify puts labels inside `.v-input` containers. React generates synthetic events. Angular uses zone-based change detection. A Vuetify autocomplete has a specific DOM structure and interaction pattern. These priors apply to any app built with that framework.

In the codebase this is `models/generic-vuetify.model.json`. When the agent encounters a new Vuetify app, it already knows how to find inputs by label, how dialogs are structured, how snackbars confirm success. This is the difference between a first-time visitor and someone who's used many Vuetify apps before — the structural patterns are familiar even if the specific content isn't.

**Layer 2b — Site-type priors.** Knowledge about a category of application, independent of how it's built. All LLM chat interfaces are structurally similar: a conversation thread, a message input, a send button, a model selector, a conversation list in a sidebar. They differ in details — what keyboard shortcut sends a message, what icon means "new conversation," whether the model picker is a dropdown or a toggle — but the topology of the experience is shared. The same is true of admin dashboards (sidebar nav, data tables, CRUD forms, role management), e-commerce checkouts (cart → shipping → payment → confirmation), issue trackers (board view, list view, detail pane, status transitions), and many other archetypes.

These priors are orthogonal to framework priors. A chatbot could be built in React or Vue or plain HTML — the framework determines how inputs accept keystrokes, but the site type determines that there *is* a message input and that pressing Enter (or Cmd+Enter, or clicking a send icon) submits it. When the agent encounters a new site and recognizes its type, it immediately has strong predictions about what pages exist, what elements to look for, and what the core workflows are — even before it has seen a single DOM node.

In the codebase this would be `models/archetype-{type}.model.json` — e.g., `archetype-admin-dashboard.model.json`, `archetype-chat-interface.model.json`. These don't exist yet but they're a natural extension of the framework model concept. A site can match multiple archetypes (an admin dashboard with a built-in chat widget), and the priors combine.

**Layer 3 — Site-specific beliefs.** The accumulated knowledge about one particular website. Which pages exist and how they connect. What each element is called and where to find it. What happens after you click a specific button. How long things take to load.

In the codebase this is `sites/{domain}/site.model.json` — the state graph (pages and transitions), the abstract target registry (every element the agent has learned to find), and the observed response signatures (what actually happens after each action).

This is where almost all learning happens. Layer 3 starts nearly empty and fills in with every interaction. But it doesn't start from nothing — it starts from the combined predictions of Layer 1, 2a, and 2b. If the agent knows the site is "a Vuetify admin dashboard," it inherits both Vuetify DOM patterns and admin dashboard workflow patterns before the first click.

**Layer 4 — URL schema and instance data.** Knowledge about how *this deployment* encodes state in its URLs, and how entity identity connects navigation to data. This layer is distinct from Layer 3's structural map because it concerns the *data model* exposed through the URL, not just the page graph.

Some sites expose entity identity directly in the URL path. YeshID uses `/organization/people/{uuid}/details` — to navigate directly to a person's detail page you need their UUID, which means reading the people list table and building a name→UUID index. Other sites hide identity behind opaque session state (you must click through, not navigate). Some actions that appear to require a button click are actually achievable by direct URL navigation — a performance and reliability win when the pattern is known.

This layer also captures filter and search affordance signatures: which query parameters control which facets (`?page=2&status=active&role=admin`), whether search is live-filtered or requires form submission, and what the URL looks like at each step of a multi-step workflow. Knowing the URL schema means the agent can predict the URL it *will* be on before navigating, verify that it *arrived* correctly, and construct deep-links rather than click-paths when that's faster and more reliable.

In the codebase this would extend `sites/{domain}/site.model.json` with a `urlSchema` section alongside the existing state graph and target registry.

## The Perception-Action Loop

Every task Yeshie performs follows the same loop:

**Perceive.** The agent observes the current page state. This means reading the DOM — not screenshots, but the semantic structure of the page. What elements are present? What are their accessible names? What state are they in? The agent doesn't just look at what's there; it interprets what it sees through its generative model. An input field isn't just a DOM node — it's a predicted affordance with an expected label, an expected location, and an expected behavior when typed into.

**Think (The Thinking Layer).** Between perception and action, the agent determines the required depth of reasoning. This is **Hierarchical Orchestration**:
- **Tier 1 (Reflex):** If the perception matches a high-confidence prediction in the cache (Layer 3), a small, fast model (e.g., Gemini Flash) immediately generates the action payload. This is "fast-path" execution.
- **Tier 2 (Reasoning):** If there is "surprise" (e.g., a target is missing or the URL is unexpected), the task is escalated to a larger, more thoughtful model (e.g., Claude 3.5 Sonnet). This model performs "Deep Exploration" to resolve the anomaly.
- **Ensemble Verification:** During learning, multiple models may be run in parallel. The "Slow" model's successful trace is used to "teach" the "Fast" model by updating the site model and cache.

This routing layer is important, but it is not the immediate foundation. It only becomes reliable after the runtime emits structured surprise evidence and the site model is populated by real exploration.

**Predict.** Before acting, the agent generates predictions. "If I click this element, the page will navigate to a detail view." "If I type into this search box, the table will filter." "The Offboard option will appear in the Manage dropdown." These predictions come from the hierarchical model — general web priors, framework patterns, and site-specific experience all contribute.

**Act.** The agent selects the action most likely to achieve its goal, given its current beliefs. The action targets a specific element, which the agent locates using a resolution cascade — cached knowledge first (fastest, most confident), then accessibility tree search, then framework-specific patterns, then text matching, then fallback CSS selectors. The resolution order is itself a model of how reliable each perception strategy is.

**Observe the reaction.** After acting, the agent observes what actually happened — not just the next page state, but the *immediate reaction* to the action. This is where DOM mutation observation earns its place. A valid text entry causes focus to advance to the next field. An invalid entry leaves focus in place and adds an error class to the input. A button click that triggers a network request may briefly disable the button before re-enabling it on success or failure. These reactions are micro-predictions that fire before any page navigation occurs, and they give the agent early signal about whether its action succeeded.

**Update.** After acting and observing the reaction, the agent compares what actually happened to what it predicted. If the prediction was correct — the element was found where expected, the reaction matched the success signature, the page transitioned as anticipated — confidence increases. If there's a mismatch — the element wasn't there, an error class appeared, the page didn't change — the agent has experienced surprise, and the model must be updated.

## Surprise as the Learning Signal

On first encounter with a website, almost everything is surprising. The agent has only its Layer 1 and Layer 2 priors. It doesn't know where the search box is, what happens when you click a name in the table, or whether offboarding is done through a link, a button, or a dropdown menu. Every step requires active perception — scanning the DOM, trying resolution strategies, discovering what's actually there.

This is the exploratory mode. Chains are short. Every step reports back. The agent is building its model.

After one successful run, the agent has ground truth. It knows the search input was resolved via `[placeholder="Search"]` with confidence 0.88. It knows clicking the name link navigates to `/organization/people/{uuid}/details`. It knows the Manage button opens a dropdown with an Offboard option. These resolved selectors, observed transitions, and confirmed response signatures are merged back into the site model.

After five successful runs, the model is confident enough that the agent can execute the entire chain locally — no per-step reporting, no exploratory pauses. It predicts every page state correctly because it has seen them all before. This is production mode. Surprise is minimized. The chain runs at page speed.

The transition from exploratory → verification → production is the agent literally reducing its free energy. The first run has high surprise (many prediction errors, slow resolution, uncertain outcomes). Each subsequent run has less surprise as the model improves. Production mode is the steady state — the agent's generative model is so accurate that it can predict the entire chain's behavior before executing it.

## Target Resolution as Active Perception

The target resolution cascade is the clearest expression of active inference in the system. When the agent needs to find an element on the page, it doesn't just search — it makes predictions and tests them in order of confidence:

1. **Cached selector.** The strongest prediction: "Last time I looked, this element was at `[aria-label="Search"]` with confidence 0.92." If the element is still there, the prediction was correct. Fast path.

2. **Accessibility tree.** If the cache misses, the agent uses its understanding of how browsers compute accessible names — aria-label, aria-labelledby, label-for associations, placeholder text. This is a Layer 1 prior: the web platform's own semantic structure.

3. **Framework patterns.** If a11y fails, try framework-specific patterns. Vuetify's `.v-label` inside `.v-input`. YeshID's `div.mb-2` sibling labels. These are Layer 2 priors that work across all apps using that framework.

4. **Text matching.** Search buttons, links, and menu items by their visible text. This is a Layer 1 prior — a button labeled "Delete User" is as stable a signal as any structural selector, and often more durable across UI redesigns. Visible text reflects *intent*, which changes less frequently than implementation. ARIA-rich codebases like Okta use developer-assigned class names (`.okta-signin-form`) that are equally stable — they name things by what they *are*, not by how they look, and they survive re-styling.

5. **Fallback CSS selectors.** Explicit selectors provided in the payload as a last resort. There are two kinds. Developer-named selectors (`.delete-user-btn`) are durable for the same reason as semantic text. Bundler-generated selectors (`.sc-bdfxlr`, `.a1b2c3`) are high-confidence while the bundle is unchanged but fragile across rebuilds — the hash changes even when the component's behavior does not.

6. **Escalation.** The agent cannot find the element. This is maximum surprise — the generative model has completely failed to predict the page structure. The run fails, and the failure itself is diagnostic data.

### The Selector Stability Hierarchy

Not all selectors age at the same rate. From most to least durable:

- **Semantic text** ("Delete User", "Sign in with Google") — stable as long as the feature exists; survives framework migrations and complete redesigns
- **ARIA attributes** (`aria-label`, `aria-labelledby`) — stable when developers maintain accessibility; survives visual redesigns
- **Developer-named CSS classes** (`.okta-form-submit`, `.v-btn--primary`) — stable when classes name intent, not appearance
- **Framework component classes** (`.v-btn`, `.MuiButton-root`) — stable across app versions, breaks on framework upgrade
- **Bundler-generated hashes** (`.sc-bdfxlr`, `[data-v-a1b2c3]`) — stable per bundle, fragile across rebuilds

**The co-selector anchor pattern.** When the agent records a bundler-generated selector that actually worked, it should also record the stable co-selectors that uniquely identify the same element: its aria-label, placeholder, semantic text, or position relative to a stable ancestor. If the opaque selector disappears on the next visit (a sign of re-bundling), the co-selectors act as recovery anchors — the agent can re-find the element via the stable attributes, confirm it's the same element by cross-checking the co-selector context, and update the cached opaque selector to whatever the new bundle generated. This converts what would be a hard failure into an automatic self-heal.

**Re-bundle detection.** If a high-confidence cached selector is absent but its stable co-selectors are still present, the working hypothesis is re-bundle rather than element removal. The agent should attempt recovery before escalating.

Each resolution produces a confidence score and a `resolvedVia` tag. After a successful run, the self-improvement script merges the winning resolution back into the model. Next time, the cache hit rate is higher, resolution is faster, and surprise is lower.

The key insight: the resolution cascade isn't just a fallback chain. It's a hierarchy of predictions ordered by specificity and confidence. The agent always tries its strongest belief first and falls back to weaker priors only when stronger ones fail. This is exactly how active inference works — precise, high-confidence predictions are preferred; vague, low-confidence ones are a last resort.

## Failure Detection as First-Class Prediction

The current model tracks success: the snackbar appeared, the page navigated, the element was found. But a complete predictive model must also predict failure. Every action has two complementary contracts: a success signature and a failure signature.

**Success signatures** confirm the action achieved its goal: a snackbar with text "Workflow created.", a URL change matching the expected pattern, an element appearing that was previously absent.

**Failure signatures** signal that the action was taken but produced the wrong outcome: an input border turning red, a `.v-messages--error` element appearing with validation text, a dialog with an error icon, a toast notification with an error-level style, a button that re-enables after a failed network request.

Both contracts must be specified and observed. An action that completes without producing either a success or failure signal is ambiguous — the agent doesn't know if it worked. That ambiguity is itself a signal: the step's contracts are incomplete and need refinement.

**Learning failure signatures.** On first encounter, the agent doesn't know what failure looks like for a particular field. But it can learn by deliberately entering invalid data and observing the reaction. The reaction is a constraint: enter `abc` in a phone number field and observe that `.v-messages--error` appears with text matching "invalid phone" — now the agent knows both the failure class and the expected error text pattern for that field. This knowledge feeds back into the site model as a validation constraint, enabling the agent to predict when its own inputs will fail before submitting.

**Error-pattern priors.** Failure signals follow framework-level patterns that can be encoded in Layer 2. Vuetify validation errors appear in `.v-messages--error` inside `.v-input`. Toast notifications in Vuetify apps use `.v-snackbar` with color variants for success and error. Material UI uses `.MuiAlert-root` with severity attributes. These patterns mean the agent can recognize failure signals on a new app using a known framework before it has seen a single error in that app.

## Reaction Sensing via DOM Mutation

After an action fires, the page reacts. That reaction is rich with signal: focus movements, class additions, element appearances, attribute changes. Capturing the reaction is essential for the failure-detection contracts described above.

The natural tool is `MutationObserver` — the browser's native mechanism for watching DOM changes. The agent can arm a mutation observer before an action fires, execute the action, and then read what changed.

**The Vue batching complication.** Vue 3 (and Vuetify) batch DOM updates through the microtask queue. A synchronous read of mutation records immediately after an action may capture intermediate states during Vue's virtual DOM reconciliation — states that do not represent the final settled UI. The fix is to yield to the microtask queue before reading settled state: `await Promise.resolve()` after the action gives Vue's scheduler time to flush pending updates before the agent interprets the mutation records.

**The validity oracle pattern.** One of the most useful applications of reaction sensing is learning a site's validation rules through observation:

- **Valid input → focus advances** to the next field. The mutation record shows a focus change (or a `blur` on the current field followed by `focus` on the next).
- **Invalid input → error class added, focus stays.** The mutation record shows a class addition (`.v-input--error`, `.is-invalid`) on the current input, no focus change.

This pattern turns the UI itself into a validation oracle. The agent doesn't need to read documentation or source code to learn that a field expects a valid email address — it enters a bad value, observes that the error class appeared and focus didn't move, and infers the constraint. Over multiple interactions it builds a complete validation model for the form, encoded in the site model as field-level constraints. Future runs skip invalid-entry paths entirely because the model predicts they will fail.

**Practical uses of mutation observation:**
- Detecting that a dropdown opened (child elements added to a `.v-overlay`)
- Detecting that a dialog appeared (a `.v-dialog--active` class was added)
- Detecting that a network request completed (a loading spinner was removed)
- Detecting that an inline error appeared without page navigation
- Detecting that form submission was accepted (form disappeared) vs. rejected (form stayed with error classes)

## Self-Improvement as Model Updating

After every successful chain execution, the `improve.js` script performs the Bayesian update: it takes the resolved selectors and observed response signatures from the run and merges them back into the site model and the payload file.

**Competitive Distillation.**
When a "Slow" model successfully navigates a complex UI puzzle that the "Fast" model failed, the resulting trace is treated as a "Gold Standard." This trace is distilled into the Layer 3 site model (the cache). Future encounters with the same state will trigger the "Fast" model to simply retrieve the verified solution from the cache, effectively "borrowing" the intelligence of the larger model without the latency.

What changes:
- `cachedSelector` is updated to whatever actually worked
- `cachedConfidence` reflects the resolution strategy's reliability
- `resolvedOn` timestamps when the observation was made
- `runCount` increments, tracking how much evidence the model is based on
- After enough evidence (5 successful runs), the payload upgrades from `verification` to `production` mode

Co-selectors are updated alongside the primary selector, maintaining the stable anchor set even as opaque selectors cycle across bundle versions.

This is the self-improving loop: act → observe → update model → act faster next time. The payload files are not static scripts — they're the agent's evolving beliefs about how to accomplish a task on a specific site. The first version is mostly priors and guesses. The fifth version is mostly cached observations and confirmed transitions.

## Task-Driven Site Mapping

The agent needs a map of a site before it can act. But not a complete map — just enough map to accomplish the task at hand. The difference matters enormously.

Consider two sites and the same task: "delete a user."

**Google Admin (admin.google.com).** The agent lands on the home page and immediately sees a Users card with direct action links: "Add a user," "Delete a user," "Update a user's name or email." The task is one click away from the starting position. The minimal map for "delete user" is a single node — the home page — because the site surfaces the action at the top level. A global search bar ("Search for users, groups, settings, or devices") offers an alternative path. The sidebar reveals deeper structure (Directory, Devices, Apps, Security, Billing...) but none of it is needed for this task.

**YeshID (app.yeshid.com).** The agent lands on a page with a sidebar navigation organized into sections: DASHBOARD, ORGANIZATION, ACCESS, SECURITY. There is no "delete user" link anywhere visible. The agent has to discover a three-state path: the People list page (under ORGANIZATION) → a person's detail page (reached by clicking the person's name in a data table) → the offboard action (hidden inside a "Manage" dropdown button on the detail page). None of these transitions are self-evident from the sidebar alone. The word "delete" doesn't even appear — YeshID calls it "offboarding."

The URL schema is also a shortcut. Once the agent has learned that detail pages live at `/organization/people/{uuid}/details`, it can navigate directly to a person's detail page without going through the list — if it knows the UUID. The people list is thus both a navigation step (first visit) and a data source (subsequent visits): by reading the table it can build a name→UUID index that enables direct navigation on all future runs.

The agent doesn't need YeshID's full 19-page site map to delete a user. It needs to discover three pages and the transitions between them. Conversely, building the full map first would waste time exploring Access Grid, RBAC, Audit Reports, and a dozen other pages irrelevant to the task.

This is task-driven exploration. The agent's priors generate predictions about what it needs to find: "deleting a user probably involves finding a user list, locating the specific user, and finding a delete/remove action." It then explores just enough to confirm or revise those predictions.

Each task the agent performs extends the map. After "delete user" succeeds, the agent knows three pages and their transitions. After "add user" succeeds, it knows the onboard form too. After "modify user," it knows the edit flow on the detail page. The map grows organically, driven by actual tasks, not by exhaustive crawling. Eventually the map approaches completeness — not because the agent set out to build a complete map, but because enough tasks have been executed to cover most of the site.

The full site map is still valuable as an explicit exploration goal. Running a dedicated exploration payload — visiting every page reachable from the navigation, collecting all affordances — gives the agent a comprehensive Layer 3 model in one pass. But even this exploration should be guided by predictions: the agent's site-type priors predict what pages an admin dashboard probably has, and the actual navigation confirms or surprises. The hardcoded page list in the current `04-site-explore.payload.json` is a bootstrap shortcut; the full vision is autonomous discovery starting from the navigation structure the site itself reveals.

The map also changes. Sites update their UI. New pages appear, buttons move, labels change. Periodic re-exploration detects these changes by diffing the new snapshot against the previous one. Where the old map predicted an element and the new exploration doesn't find it, that's surprise — the model needs updating. Where the new exploration finds something the old map didn't predict, that's discovery — the model gains coverage.

## Shared Models

A single agent learning a single site is useful. A network of agents sharing what they've learned is transformative.

Layer 3 models are site-specific — one user's YeshID model is directly useful to another user of YeshID. If the first agent has already discovered that "delete user" means navigating to People → clicking a name → Manage → Offboard, the second agent shouldn't have to rediscover this. The resolved selectors, state graphs, confirmed response signatures, and URL schemas can be shared.

Layer 2b models (site-type priors) are even more shareable. Every admin dashboard an agent encounters refines its understanding of what admin dashboards look like in general. Every chatbot interface it masters contributes to a shared prior about chatbot interfaces. These priors apply across the entire network — an agent that has never seen a particular admin dashboard still benefits from every other agent's experience with admin dashboards.

Layer 2a models (framework priors) are similarly transferable. Vuetify's DOM patterns are the same whether the app is YeshID or any other Vuetify app. When one agent discovers that Vuetify uses `<a>` tags without `href` attributes for router navigation (as we found during YeshID development), that discovery should propagate to every agent that will ever encounter a Vuetify app. Similarly, when one agent characterizes Vuetify's failure signal pattern (`.v-messages--error` inside `.v-input`), every subsequent agent inherits that knowledge and can recognize form validation failures on the first encounter.

The sharing mechanism is straightforward in principle: models are JSON files with confidence scores and timestamps. Merging two agents' models for the same site means taking the higher-confidence resolution for each target. Merging site-type priors means accumulating patterns observed across sites. A central registry (or a peer-to-peer exchange) distributes updates.

The interesting question is trust. Not every agent's observations are equally reliable. A model built from 50 successful runs is more trustworthy than one built from 2. A model updated yesterday is more current than one from six months ago. The confidence scores and timestamps already present in the model format provide the raw material for a trust-weighted merge: recent, high-confidence, frequently-confirmed observations win over old, low-confidence, unverified ones.

This creates a flywheel. More agents using Yeshie means more sites modeled, more priors refined, and faster convergence on any new site. The first agent to encounter a site does the hard exploration work. Every subsequent agent benefits from what was learned. The collective model of "how websites work" improves with every interaction across the network.

## Why This Framing Matters

Most web automation tools treat the problem as scripting: write a sequence of instructions, hope the selectors don't change, add retries and waits when they do. This is fragile because it's purely reactive — the script has no model of the site and no ability to adapt.

Active inference reframes the problem. The agent has a model. The model makes predictions. When predictions fail, the model updates. When predictions succeed, confidence grows. The same mechanism that handles a first-time visit to an unknown page also handles a hundredth run of a proven workflow — it's just that the hundredth run has better priors.

This also explains why the layered architecture works. You don't need to teach the agent about every website from scratch. Layer 1 (web priors), Layer 2a (framework priors), Layer 2b (site-type priors), and Layer 4 (URL schema and instance data) each encode transferable knowledge at different levels of specificity. When the agent encounters a new Vuetify admin dashboard, it inherits Vuetify DOM patterns, admin dashboard workflow patterns, and the general understanding that CRUD apps expose entity identity in URLs. Only Layer 3 needs to be learned from scratch, and even that starts with a guided exploration informed by all the other layers' predictions.

The north star — "point at any website, run an exploration payload, then generate and execute task payloads from natural language" — is the natural endpoint of this process. An agent with good priors can classify a site's type, identify its framework, explore its pages to build a site map (including URL schema and entity tables), and start automating tasks with minimal supervision. Each run makes the model better. Eventually the agent knows the site so well that it can predict every state transition, every validation constraint, and every URL it will visit — before it happens.

## Relationship to Other Documents

This document describes what Yeshie is trying to be. The other project documents describe how:

- **SPECIFICATION.md** — detailed implementation spec (Rev 11). Covers architecture, extension design, MCP tools, event simulation, skill system. Much of it is aspirational and doesn't match the current implementation, but the technical foundations are sound.
- **README.md** — describes the three-layer model and self-improvement loop in concrete terms. Implementation-focused complement to this document.
- **CLAUDE.md** — working context for active development. Current state, startup commands, file locations, pending tasks.
- **models/runtime.model.json** — Layer 1 (web priors), machine-readable.
- **models/generic-vuetify.model.json** — Layer 2a (framework priors), machine-readable.
- **models/archetype-*.model.json** — Layer 2b (site-type priors), not yet implemented.
- **sites/yeshid/site.model.json** — Layer 3 for YeshID, machine-readable.
- **sites/yeshid/tasks/04-site-explore.payload.json** — global site map builder for YeshID.
