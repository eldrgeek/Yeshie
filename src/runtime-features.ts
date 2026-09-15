/**
 * Features of the live runtime (packages/extension/src/entrypoints/background.ts)
 * that a recipe can require before it acts:
 *
 *   { "action": "assert", "requires": ["within_row.cells"], "message": "..." }
 *
 * The assert fails, and the chain stops, unless this build lists every feature
 * the step names. Put the guard before the first step that needs the feature,
 * alone in its own assert. src/assert-step.ts explains why it must stand alone.
 *
 * The guard names features rather than a minimum build number, for three
 * reasons. The extension's version is `0.1.<n>`, where n counts the builds
 * com.yeshie.watcher has made of the main checkout (packages/watch-and-build.mjs),
 * whatever code that checkout held. So the number of the first build that
 * carries a feature is unknown until that build happens. A checkout moved to
 * an older branch still gets a higher number. And a build made from any other
 * checkout reports the committed version, which was 0.1.513 on 2026-09-15.
 * A feature name ships in the same code as the feature, so a build lists the
 * name exactly when it has the code.
 *
 * Add a name in the same change that adds the feature, with a test that
 * exercises it. tests/unit/runtime-features.test.ts checks that each name has
 * code behind it. The list holds only the features that recipes have needed
 * to require so far.
 */
export const RUNTIME_FEATURES: readonly string[] = Object.freeze([
  'select', // the `select` action (Yeshie #66)
  'within_row', // click + within_row, text form (Yeshie #66)
  'within_row.cells', // click + within_row { cells }, the exact-cell form (src/row-scope.ts)
]);
