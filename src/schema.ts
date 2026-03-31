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
  params: z.array(z.string()).optional(),
  optionalParams: z.array(z.string()).optional(),
}).passthrough();

export const PayloadSchema = z.object({
  _meta: PayloadMetaSchema,
  runId: z.string(),
  mode: z.enum(['exploratory', 'verification', 'production']),
  site: z.string(),
  params: z.record(z.any()),
  chain: z.array(z.any()),                    // steps array
  stateGraph: z.record(z.any()).optional(),
  abstractTargets: z.record(z.any()).optional(),
  branches: z.record(z.any()).optional(),
  pages: z.array(z.any()).optional(),          // 04-site-explore
  explorationScript: z.any().optional(),       // 04-site-explore
  outputFormat: z.any().optional(),            // 04-site-explore
  preRunChecklist: z.union([z.array(z.string()), z.record(z.any())]).optional(), // 05-integration-setup
}).passthrough();

export type Payload = z.infer<typeof PayloadSchema>;
