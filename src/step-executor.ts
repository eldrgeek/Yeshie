// Step Executor — executes individual payload chain steps
// Runs in-page via executor-inject.js (browser context)
// This file is the canonical reference; executor-inject.js mirrors it

export type StepAction =
  | 'assess_state' | 'navigate' | 'type' | 'click' | 'click_preset'
  | 'wait_for' | 'read' | 'hover' | 'scroll' | 'assert' | 'js' | 'select'
  | 'probe_affordances';

export interface StepResult {
  stepId: string;
  action: StepAction | string;
  status: 'ok' | 'skipped' | 'error' | 'unsupported';
  durationMs: number;
  // type-specific fields
  state?: string;
  matched?: boolean;
  value?: string;
  text?: string;
  selector?: string | null;
  confidence?: number;
  resolvedVia?: string;
  target?: string;
  url?: string;
  responseSignature?: ResponseSignatureResult;
  result?: unknown;
  storedAs?: string;
  reason?: string;
  error?: string;
}

export interface ResponseSignatureResult {
  matched: boolean;
  type?: string;
  url?: string;
  selector?: string;
  text?: string;
  timeout?: boolean;
  snackbarText?: string;
  alertText?: string;
  urlNow?: string;
}
