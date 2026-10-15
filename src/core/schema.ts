import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;

export const NODE_KINDS = [
  'instruction',
  'rule',
  'skill',
  'agent',
  'file',
  'script',
  'mcp-config',
  'mcp-server',
  'directory',
] as const;

/** `invokes` / `delegates-to` are reserved and not emitted in MVP. */
export const RELATIONS = ['contains', 'references', 'applies-to', 'annotation'] as const;

export const EVIDENCE = ['explicit', 'derived', 'inferred', 'annotation'] as const;

export const SEVERITIES = ['info', 'warning', 'error'] as const;

/** `offset` is a UTF-16 index into the decoded text (BOM stripped); `line`/`column` are 1-based. */
export const SpanSchema = z.object({
  offset: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export const SourceLocationSchema = z.object({
  path: z.string().min(1),
  start: SpanSchema.optional(),
  end: SpanSchema.optional(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  adapter: z.string().min(1),
});

export const AgentNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(NODE_KINDS),
  name: z.string(),
  source: SourceLocationSchema.optional(),
  attributes: z.record(z.string(), z.unknown()),
  /** Codes of graph diagnostics attached to this node. */
  diagnostics: z.array(z.string()),
});

export const AgentEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relation: z.enum(RELATIONS),
  evidence: z.enum(EVIDENCE),
  provenance: SourceLocationSchema.optional(),
  explanation: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  supportedOperations: z.array(z.string()),
});

export const GraphDiagnosticSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  severity: z.enum(SEVERITIES),
  path: z.string().optional(),
  span: SpanSchema.optional(),
  nodeId: z.string().optional(),
});

export const FileSourceCapabilitiesSchema = z.object({
  write: z.boolean(),
  watch: z.boolean(),
});

export const AgentGraphSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  source: z.object({ id: z.string().min(1), capabilities: FileSourceCapabilitiesSchema }),
  generatedBy: z.object({ adapter: z.string().min(1), version: z.string().min(1) }),
  nodes: z.array(AgentNodeSchema),
  edges: z.array(AgentEdgeSchema),
  diagnostics: z.array(GraphDiagnosticSchema),
});

export type NodeKind = (typeof NODE_KINDS)[number];
export type Relation = (typeof RELATIONS)[number];
export type Evidence = (typeof EVIDENCE)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Span = z.infer<typeof SpanSchema>;
export type SourceLocation = z.infer<typeof SourceLocationSchema>;
export type AgentNode = z.infer<typeof AgentNodeSchema>;
export type AgentEdge = z.infer<typeof AgentEdgeSchema>;
export type GraphDiagnostic = z.infer<typeof GraphDiagnosticSchema>;
export type FileSourceCapabilities = z.infer<typeof FileSourceCapabilitiesSchema>;
export type AgentGraph = z.infer<typeof AgentGraphSchema>;
