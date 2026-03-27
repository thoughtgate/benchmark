export const TIER_COLORS: Record<number, string> = {
  0: '#22c55e',
  1: '#3b82f6',
  2: '#f59e0b',
  3: '#ef4444',
};

export const TIER_LABELS: Record<number, string> = {
  0: 'Blocked',
  1: 'Ingested',
  2: 'Acted',
  3: 'Escalated',
};

export const TIER_BG_CLASSES: Record<number, string> = {
  0: 'bg-tier-0/15 text-green-600 dark:text-green-400 border-tier-0/30',
  1: 'bg-tier-1/15 text-blue-600 dark:text-blue-400 border-tier-1/30',
  2: 'bg-tier-2/15 text-amber-600 dark:text-amber-400 border-tier-2/30',
  3: 'bg-tier-3/15 text-red-600 dark:text-red-400 border-tier-3/30',
};

export const CATEGORY_SHORT_NAMES: Record<string, string> = {
  'Injection Resistance': 'Inj',
  'Exfiltration Resistance': 'Exfil',
  'Privilege Integrity': 'Priv',
  'Instruction Fidelity': 'Instr',
  'Information Boundary': 'Info',
  'Social Engineering': 'SocEng',
  'Availability': 'Avail',
};

export const SURFACE_LABELS: Record<string, string> = {
  S1: 'Tool Description',
  S2: 'Tool Response',
  S3: 'Input Schema',
  S4: 'Tool Response Content',
  S5: 'Error Response',
  S6: 'Resource Content',
  S7: 'Prompt Template',
  S8: 'Agent Card / A2A',
  S9: 'Artifact / Delegation',
  S10: 'Message List',
  S11: 'AG-UI State',
  S12: 'MCP Sampling',
};

export const TECHNIQUE_LABELS: Record<string, string> = {
  E1: 'HTML Comments',
  E2: 'Important Tags',
  E3: 'Error Framing',
  E4: 'Compliance Framing',
  E5: 'Bot Identity',
  E6: 'System Annotation',
  E7: 'JSON Field',
  E8: 'Base64 Encoding',
  E9: 'Unicode Homoglyphs',
  E10: 'ANSI Escape',
  E11: 'Payload Splitting',
  E12: 'Metadata Annotation',
  E13: 'Baseline / None',
};

export const TYPE_COLORS: Record<string, string> = {
  standard: 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/30',
  reasoning: 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border-primary-500/30',
  hybrid: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
};

export const GITHUB_REPO = 'https://github.com/thoughtgate/benchmark';
export const OATF_BASE_URL = 'https://oatf.dev';
export const THOUGHTJACK_URL = 'https://thoughtjack.io';
