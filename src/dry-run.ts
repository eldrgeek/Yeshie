// Dry-run resolution: resolves all abstractTargets in a payload
// without executing any steps. Returns ResolutionReport.
// Used by: run-payload.js --dry-run
// Mirrors the logic in executor-inject.js but runs in Node with jsdom

import { TargetResolver, AbstractTarget } from './target-resolver.js';

export interface ResolutionReport {
  dryRun: true;
  payload: string;
  allResolved: boolean;
  escalations: string[];
  targets: Record<string, {
    resolvedVia: string;
    selector: string | null;
    confidence: number;
    elementId?: string;
    labelStrategy?: string;
    durationMs: number;
  }>;
}

export function dryRunResolve(
  doc: Document,
  payloadName: string,
  abstractTargets: Record<string, AbstractTarget>
): ResolutionReport {
  const resolver = new TargetResolver(doc);
  const targets: ResolutionReport['targets'] = {};

  for (const [name, target] of Object.entries(abstractTargets)) {
    const t0 = Date.now();
    const result = resolver.resolve(target);
    targets[name] = {
      resolvedVia: result.resolvedVia,
      selector: result.selector,
      confidence: result.confidence,
      elementId: (result.element as HTMLElement | null)?.id,
      durationMs: Date.now() - t0,
    };
  }

  const escalations = Object.keys(targets).filter(k => targets[k].resolvedVia === 'escalate');

  return {
    dryRun: true,
    payload: payloadName,
    allResolved: escalations.length === 0,
    escalations,
    targets,
  };
}
