import {
  type AgentNode,
  createSpanLocator,
  type GraphDiagnostic,
  type GraphFragment,
  nodeId,
  type PendingEdge,
} from '../../../core';
import type { Discovered, LoadedFile } from '../../adapter';
import { maskArgs, maskCommand, REDACTED, redactMap, sanitizeUrl } from './redact';

const KNOWN_SERVER_FIELDS = ['type', 'command', 'args', 'env', 'envFile', 'url', 'headers', 'auth'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Server attributes with every secret-bearing value redacted. Raw values never leave this function. */
export function redactServer(
  name: string,
  server: Record<string, unknown>,
): Record<string, unknown> {
  const transport =
    typeof server.type === 'string'
      ? server.type
      : server.command !== undefined
        ? 'stdio'
        : server.url !== undefined
          ? 'remote'
          : 'unknown';
  const attributes: Record<string, unknown> = { name, transport };
  if (server.command !== undefined) attributes.command = maskCommand(server.command);
  if (server.args !== undefined) attributes.args = maskArgs(server.args);
  if (server.env !== undefined) attributes.env = redactMap(server.env);
  if (server.envFile !== undefined) {
    attributes.envFile = typeof server.envFile === 'string' ? server.envFile : REDACTED;
  }
  if (server.url !== undefined) attributes.url = sanitizeUrl(server.url);
  if (server.headers !== undefined) attributes.headers = redactMap(server.headers);
  if (server.auth !== undefined) attributes.auth = redactMap(server.auth);
  const otherKeys = Object.keys(server)
    .filter((key) => !KNOWN_SERVER_FIELDS.includes(key))
    .sort();
  if (otherKeys.length > 0) attributes.otherKeys = otherKeys;
  return attributes;
}

function redactServerConfig(server: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(server).map(([key, value]): [string, unknown] => {
      switch (key) {
        case 'type':
        case 'envFile':
          return [key, typeof value === 'string' ? value : REDACTED];
        case 'command':
          return [key, maskCommand(value)];
        case 'args':
          return [key, maskArgs(value)];
        case 'url':
          return [key, sanitizeUrl(value)];
        case 'env':
        case 'headers':
        case 'auth':
          return [key, redactMap(value)];
        default:
          return [key, REDACTED];
      }
    }),
  );
}

/**
 * `mcp.json` re-serialized with every secret-bearing value redacted, for display.
 * Offsets do not match the original file. Invalid JSON is withheld entirely.
 */
export function redactMcpConfigText(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return '// mcp.json is not valid JSON; its content is withheld because it may contain secrets.\n';
  }
  if (!isRecord(parsed)) return `${JSON.stringify(REDACTED)}\n`;
  const redacted = Object.fromEntries(
    Object.entries(parsed).map(([key, value]): [string, unknown] => {
      if (key !== 'mcpServers' || !isRecord(value)) return [key, REDACTED];
      return [
        key,
        Object.fromEntries(
          Object.entries(value).map(([name, server]) => [
            name,
            isRecord(server) ? redactServerConfig(server) : REDACTED,
          ]),
        ),
      ];
    }),
  );
  return `${JSON.stringify(redacted, null, 2)}\n`;
}

/** Offset of `"name":` inside the `mcpServers` object, for provenance. */
function serverKeyOffset(text: string, name: string): number | null {
  const container = text.indexOf('"mcpServers"');
  if (container === -1) return null;
  const literal = JSON.stringify(name);
  for (
    let at = text.indexOf(literal, container + 1);
    at !== -1;
    at = text.indexOf(literal, at + 1)
  ) {
    if (/^\s*:/.test(text.slice(at + literal.length))) return at;
  }
  return null;
}

/** Parses `.cursor/mcp.json` with strict `JSON.parse`; error messages never echo file content. */
export function parseMcpConfig(d: Discovered, file: LoadedFile): GraphFragment {
  const id = nodeId('mcp-config', d.path);
  const source = { path: file.path, contentHash: file.contentHash, adapter: d.adapterId };
  const diagnostics: GraphDiagnostic[] = [];
  const nodes: AgentNode[] = [];
  const edges: PendingEdge[] = [];
  const locate = createSpanLocator(file.text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch (error) {
    const position = /position (\d+)/.exec(error instanceof Error ? error.message : '')?.[1];
    diagnostics.push({
      code: 'mcp-json-invalid',
      message: 'mcp.json is not valid JSON (strict parse; comments are not verified as supported).',
      severity: 'error',
      path: d.path,
      nodeId: id,
      ...(position === undefined ? {} : { span: locate(Number(position)) }),
    });
  }

  const servers = isRecord(parsed) ? parsed.mcpServers : undefined;
  if (parsed !== undefined && !isRecord(servers)) {
    diagnostics.push({
      code: 'mcp-servers-missing',
      message: 'mcp.json has no "mcpServers" object.',
      severity: 'warning',
      path: d.path,
      nodeId: id,
    });
  }

  const names = isRecord(servers) ? Object.keys(servers).sort() : [];
  for (const name of names) {
    const server = (servers as Record<string, unknown>)[name];
    const serverId = nodeId('mcp-server', d.path, name);
    if (!isRecord(server)) {
      diagnostics.push({
        code: 'mcp-server-invalid',
        message: `MCP server "${name}" is not an object.`,
        severity: 'warning',
        path: d.path,
        nodeId: id,
      });
      continue;
    }
    const offset = serverKeyOffset(file.text, name);
    const span =
      offset === null
        ? {}
        : { start: locate(offset), end: locate(offset + JSON.stringify(name).length) };
    nodes.push({
      id: serverId,
      kind: 'mcp-server',
      name,
      source: { ...source, ...span },
      attributes: { ...redactServer(name, server), engine: d.engine, root: d.root },
      diagnostics: [],
    });
    edges.push({
      source: id,
      target: { kind: 'node', id: serverId },
      relation: 'contains',
      evidence: 'explicit',
      linkKind: 'contains',
      ...(offset === null ? {} : { provenance: { ...source, ...span } }),
      explanation: 'Server declared in mcp.json',
    });
  }

  nodes.push({
    id,
    kind: 'mcp-config',
    name: d.path,
    source,
    attributes: {
      path: d.path,
      scope: d.scope,
      engine: d.engine,
      root: d.root,
      serverCount: nodes.length,
    },
    diagnostics: [],
  });
  return { nodes, edges, diagnostics, owners: [{ path: d.path, nodeId: id }] };
}
