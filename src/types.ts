// Core Yeshie types — derived from actual payload files
import type { ResolutionMethod, ResolvedTargetUpdate, SurpriseEvidence } from './runtime-contract.js';

export interface AbstractTarget {
  match?: { role?: string; vuetify_label?: string[]; [key: string]: any };
  cachedSelector: string | null;
  cachedConfidence: number;
  resolvedOn?: string | null;
  resolveHint?: string;
  semanticKeys?: string[];
  resolutionStrategy?: string;
  description?: string;
}

export interface StateNode {
  signals: Array<{ type: string; selector?: string; pattern?: string; text?: string }>;
  transitions?: string[];
}

export interface StateGraph {
  currentNode?: string;
  nodes: Record<string, StateNode>;
}

export interface Step {
  action: string;
  target?: string;
  selector?: string;
  value?: string;
  url?: string;
  code?: string;
  condition?: string;
  dynamic?: boolean;
  store_to_buffer?: string;
  guard?: any;
  expect?: any;
  onMatch?: Step[];
  onMismatch?: Step[];
  [key: string]: any;
}

export interface Payload {
  _meta: {
    task: string;
    description?: string;
    runCount?: number;
    lastSuccess?: string | null;
    [key: string]: any;
  };
  runId: string;
  mode: 'exploratory' | 'verification' | 'production';
  site: string;
  params: Record<string, any>;
  chain: Step[];
  stateGraph?: StateGraph;
  abstractTargets?: Record<string, AbstractTarget>;
  branches?: Record<string, Step[]>;
  preRunChecklist?: string[];
  [key: string]: any;
}

export interface ResolvedTarget {
  abstractName: string;
  selector: string | null;
  confidence: number;
  resolvedVia: ResolutionMethod;
  resolvedAt: string;
}

export interface StepResult {
  stepIndex: number;
  action: string;
  success: boolean;
  guardPassed?: boolean;
  result?: any;
  error?: string;
  durationMs: number;
  diagnostics?: any;
  surpriseEvidence?: SurpriseEvidence[];
}

export interface ModelUpdates {
  resolvedTargets: Record<string, ResolvedTargetUpdate> | ResolvedTarget[];
  newTargetsDiscovered: AbstractTarget[];
  statesObserved: string[];
  signaturesObserved: Record<string, string[]>;
  surpriseEvidence?: SurpriseEvidence[];
}

export interface ChainResult {
  success: boolean;
  payloadName: string;
  site: string;
  stepsExecuted: number;
  stepResults: StepResult[];
  modelUpdates: ModelUpdates;
  needsChecklist?: boolean;
  checklistItems?: string[];
  error?: string;
  durationMs: number;
}
