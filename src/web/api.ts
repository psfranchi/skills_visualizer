import { hc } from 'hono/client';
import type { GraphDiagnostic } from '../core';
import {
  type AgentGraph,
  AgentGraphSchema,
  type GraphViewState,
  GraphViewStateSchema,
} from '../core';
import type {
  AppType,
  EditApplyResponse,
  EditPreviewResponse,
  FileResponse,
  Meta,
} from '../server/app';

const client = hc<AppType>('/');

async function ok<T>(response: Response, what: string): Promise<T> {
  if (!response.ok) throw new Error(`${what} failed (${response.status})`);
  return (await response.json()) as T;
}

export async function fetchMeta(): Promise<Meta> {
  return ok<Meta>(await client.api.meta.$get(), 'Loading metadata');
}

export async function fetchGraph(): Promise<AgentGraph> {
  return AgentGraphSchema.parse(await ok(await client.api.graph.$get(), 'Loading graph'));
}

export async function rescan(): Promise<AgentGraph> {
  return AgentGraphSchema.parse(await ok(await client.api.scan.$post({ json: {} }), 'Rescan'));
}

export async function fetchFile(path: string): Promise<FileResponse> {
  return ok<FileResponse>(await client.api.file.$get({ query: { path } }), 'Loading source');
}

export async function fetchViewState(): Promise<GraphViewState> {
  return GraphViewStateSchema.parse(
    await ok(await client.api['view-state'].$get(), 'Loading view state'),
  );
}

export async function saveViewState(view: GraphViewState): Promise<void> {
  await ok(await client.api['view-state'].$put({ json: view }), 'Saving view state');
}

/** Best-effort save while the page unloads; `keepalive` lets the request outlive the page. */
export function saveViewStateOnExit(view: GraphViewState): void {
  fetch('/api/view-state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(view),
    keepalive: true,
  }).catch(() => {});
}

export async function previewEdit(input: {
  path: string;
  expectedHash: string;
  newText: string;
}): Promise<EditPreviewResponse> {
  return ok(await client.api.edits.preview.$post({ json: input }), 'Preview edit');
}

export async function applyEdit(input: {
  path: string;
  expectedHash: string;
  newText: string;
}): Promise<{
  status: number;
  body: Partial<EditApplyResponse> & {
    currentHash?: string;
    error?: string;
    diagnostics?: GraphDiagnostic[];
  };
}> {
  const response = await client.api.edits.apply.$post({ json: input });
  const body = (await response.json()) as Partial<EditApplyResponse> & {
    currentHash?: string;
    error?: string;
    diagnostics?: GraphDiagnostic[];
  };
  if (response.ok && body.graph) {
    body.graph = AgentGraphSchema.parse(body.graph);
  }
  return { status: response.status, body };
}
