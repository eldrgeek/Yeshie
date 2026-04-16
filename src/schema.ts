import { z } from 'zod';

// Permissive schema — validates required top-level fields exist
// without over-constraining nested structures we're still learning

export const PayloadMetaSchema = z.object({
  task: z.string(),
  description: z.string().optional(),
  selfImproving: z.boolean().optional(),
  runCount: z.number().optional(),
  lastSuccess: z.string().nullable().optional(),
  prerequisite: z.string().optional(),
  // params in _meta can be an array of strings (legacy) or an object of param definitions
  params: z.union([z.array(z.string()), z.record(z.any())]).optional(),
  requiredParams: z.array(z.string()).optional(),
  optionalParams: z.array(z.string()).optional(),
}).passthrough();

export const PayloadSchema = z.object({
  _meta: PayloadMetaSchema,
  // Some older/special payloads omit these top-level fields
  runId: z.string().optional(),
  mode: z.enum(['exploratory', 'verification', 'production']).optional(),
  site: z.string().optional(),
  params: z.record(z.any()).optional(),
  chain: z.array(z.any()).optional(),          // steps array (optional for template-style payloads)
  stateGraph: z.record(z.any()).optional(),
  abstractTargets: z.record(z.any()).optional(),
  urlSchema: z.record(z.any()).optional(),
  branches: z.record(z.any()).optional(),
  pages: z.array(z.any()).optional(),          // 04-site-explore
  explorationScript: z.any().optional(),       // 04-site-explore
  outputFormat: z.any().optional(),            // 04-site-explore
  preRunChecklist: z.union([z.array(z.string()), z.record(z.any())]).optional(), // 05-integration-setup
}).passthrough();

export type Payload = z.infer<typeof PayloadSchema>;
