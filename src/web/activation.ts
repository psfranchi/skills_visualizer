/** Rule activation modes from scanner `attributes.activation`. */
export type RuleActivation =
  | 'always-apply'
  | 'apply-to-specific-files'
  | 'apply-intelligently'
  | 'apply-manually';

const LABELS: Record<RuleActivation, string> = {
  'always-apply': 'Always Apply',
  'apply-to-specific-files': 'Specific Files',
  'apply-intelligently': 'Intelligently',
  'apply-manually': 'Manually',
};

export function isRuleActivation(value: unknown): value is RuleActivation {
  return typeof value === 'string' && value in LABELS;
}

export function activationLabel(value: unknown): string | null {
  return isRuleActivation(value) ? LABELS[value] : null;
}
