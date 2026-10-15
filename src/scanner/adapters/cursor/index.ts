import type { ClientAdapter, Discovered, LoadedFile } from '../../adapter';
import { classifyCursorPaths } from './classify';
import { globApplyFragment } from './glob-edges';
import { ADAPTER_ID, parseAgent, parseInstruction, parseRule, parseSkill } from './markdown-kinds';
import { parseMcpConfig } from './mcp';

export { redactMcpConfigText } from './mcp';

function parse(d: Discovered, file: LoadedFile) {
  switch (d.kind) {
    case 'instruction':
      return parseInstruction(d, file);
    case 'rule':
      return parseRule(d, file);
    case 'skill':
      return parseSkill(d, file);
    case 'agent':
      return parseAgent(d, file);
    case 'mcp-config':
      return parseMcpConfig(d, file);
  }
}

/** Cursor-only adapter (used inside multi; also available for focused tests). */
export const cursorAdapter: ClientAdapter = {
  id: ADAPTER_ID,
  version: '0.1.0',
  classify: classifyCursorPaths,
  parse,
  enrich: globApplyFragment,
  editable: (d) => d.kind === 'skill',
};
