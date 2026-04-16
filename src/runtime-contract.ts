export const RESOLUTION_METHODS = [
  'data_se',
  'cached',
  'auto_heal',
  'aria',
  'a11y_aria_label',
  'a11y_label_for',
  'a11y_placeholder',
  'text_match',
  'vuetify_label_match',
  'contenteditable',
  'css_cascade',
  'escalate',
] as const;

export type ResolutionMethod = typeof RESOLUTION_METHODS[number];

export const SURPRISE_KINDS = [
  'target_not_found',
  'guard_timeout',
  'url_mismatch',
  'state_mismatch',
  'unexpected_ui',
] as const;

export type SurpriseKind = typeof SURPRISE_KINDS[number];

export interface SurpriseEvidence {
  kind: SurpriseKind;
  stepId?: string;
  target?: string;
  expected?: string;
  observed?: string;
  details?: string;
}

export interface ResolvedTargetUpdate {
  selector: string | null;
  confidence: number;
  resolvedVia: ResolutionMethod;
  resolvedOn: string;
  resolutionMethod?: ResolutionMethod;
}

export function createResolvedTargetUpdate(
  selector: string | null,
  confidence: number,
  resolvedVia: ResolutionMethod,
  resolvedOn = new Date().toISOString()
): ResolvedTargetUpdate {
  return {
    selector,
    confidence,
    resolvedVia,
    resolvedOn,
    resolutionMethod: resolvedVia,
  };
}

export function normalizeResolvedTargetUpdate(update: Partial<ResolvedTargetUpdate> & {
  selector?: string | null;
  confidence?: number;
  resolvedVia?: ResolutionMethod;
  resolutionMethod?: ResolutionMethod;
  resolvedOn?: string;
  cachedAt?: string;
}) {
  const resolvedVia = update.resolvedVia || update.resolutionMethod || 'escalate';
  const resolvedOn = update.resolvedOn || update.cachedAt || new Date().toISOString();
  return createResolvedTargetUpdate(
    update.selector ?? null,
    update.confidence ?? 0,
    resolvedVia,
    resolvedOn
  );
}

export function createSurpriseEvidence(
  kind: SurpriseKind,
  fields: Omit<SurpriseEvidence, 'kind'> = {}
): SurpriseEvidence {
  return { kind, ...fields };
}
