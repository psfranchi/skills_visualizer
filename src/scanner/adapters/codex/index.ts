import type { ClientAdapter, Discovered, LoadedFile } from '../../adapter';
import { parseAgent, parseSkill } from '../cursor/markdown-kinds';
import { classifyCodexPaths } from './classify';

function parse(d: Discovered, file: LoadedFile) {
  switch (d.kind) {
    case 'skill':
      return parseSkill(d, file);
    case 'agent':
      return parseAgent(d, file);
    case 'instruction':
    case 'rule':
    case 'mcp-config':
      throw new Error(`Codex adapter does not parse ${d.kind}`);
  }
}

export const codexAdapter: ClientAdapter = {
  id: 'codex',
  version: '0.1.0',
  classify: classifyCodexPaths,
  parse,
  editable: (d) => d.kind === 'skill',
};
