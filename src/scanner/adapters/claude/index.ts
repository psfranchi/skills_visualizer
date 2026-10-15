import type { ClientAdapter, Discovered, LoadedFile } from '../../adapter';
import { parseAgent, parseInstruction, parseSkill } from '../cursor/markdown-kinds';
import { classifyClaudePaths } from './classify';

function parse(d: Discovered, file: LoadedFile) {
  switch (d.kind) {
    case 'instruction':
      return parseInstruction(d, file);
    case 'skill':
      return parseSkill(d, file);
    case 'agent':
      return parseAgent(d, file);
    case 'rule':
    case 'mcp-config':
      throw new Error(`Claude adapter does not parse ${d.kind}`);
  }
}

export const claudeAdapter: ClientAdapter = {
  id: 'claude',
  version: '0.1.0',
  classify: classifyClaudePaths,
  parse,
  editable: (d) => d.kind === 'skill',
};
