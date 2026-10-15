// Edit planning, diff, validation, EOL/BOM restore (M3).

export { unifiedDiff } from './diff';
export { editableSkillPaths, isEditableSkill, nodeIsEditable } from './editable';
export { type EdgeImpact, edgeImpact } from './impact';
export {
  applyEol,
  detectEol,
  type Eol,
  type PlannedReplace,
  planReplace,
} from './plan-replace';
export { type SkillValidation, validateSkillBytes } from './validate';

export const EDITABLE_KINDS = ['skill'] as const;
