// ══════════════════════════════════════════════════════
//  Server-side mirror of shared/process.ts
//  Kept in sync with shared/process.ts.
//  Lives here because server/tsconfig.json rootDir
//  is locked to server/src/ and cannot import from shared/.
// ══════════════════════════════════════════════════════

export interface RoleDefinition {
  id: string;
  name: string;
  persona: string;
  color?: string;
}

export type TurnStructure =
  | { type: 'sequential'; order: string[] }
  | { type: 'parallel' }
  | { type: 'single'; role: string };

export type CompletionCriteria =
  | { type: 'turn_count'; turns: number }
  | { type: 'explicit_signal' };

export interface ArtifactDefinition {
  id: string;
  label: string;
  producedBy: string | 'all';
}

export interface StageDefinition {
  id: string;
  name: string;
  goal: string;
  roles: string[];
  turnStructure: TurnStructure;
  completionCriteria: CompletionCriteria;
  artifacts: ArtifactDefinition[];
}

export interface ProcessDefinition {
  id: string;
  name: string;
  description: string;
  roles: RoleDefinition[];
  stages: StageDefinition[];
}

export const STANDARD_BRAINSTORM: ProcessDefinition = {
  id: 'standard_brainstorm',
  name: 'Standard Brainstorm',
  description: 'A classic diverge-converge session: generate ideas freely, stress-test them, then synthesize the best into a clear recommendation.',

  roles: [
    {
      id: 'facilitator',
      name: 'Facilitator',
      persona: 'You guide the session, keep agents on track, and ensure the group makes progress. You summarize, redirect when stuck, and call stages complete when goals are met.',
    },
    {
      id: 'ideator',
      name: 'Ideator',
      persona: 'You generate creative, diverse ideas without self-censorship. Quantity over quality at this stage — wild ideas are welcome.',
    },
    {
      id: 'devils_advocate',
      name: "Devil's Advocate",
      persona: "You rigorously challenge every idea. Find weaknesses, edge cases, and unstated assumptions. Your goal is not to be negative but to stress-test ideas so only strong ones survive.",
    },
    {
      id: 'synthesizer',
      name: 'Synthesizer',
      persona: 'You identify the strongest threads across all contributions and weave them into a coherent, actionable recommendation. You find common ground and build bridges between competing ideas.',
    },
  ],

  stages: [
    {
      id: 'ideation',
      name: 'Ideation',
      goal: 'Generate a broad set of diverse ideas addressing the problem. No filtering yet — quantity and variety are the goals.',
      roles: ['facilitator', 'ideator'],
      turnStructure: { type: 'sequential', order: ['ideator', 'facilitator'] },
      completionCriteria: { type: 'turn_count', turns: 3 },
      artifacts: [
        { id: 'idea_list', label: 'Generated Ideas', producedBy: 'ideator' },
      ],
    },
    {
      id: 'critique',
      name: 'Critique',
      goal: 'Stress-test the ideas from the ideation stage. Identify weaknesses, risks, and unstated assumptions for each idea.',
      roles: ['facilitator', 'devils_advocate'],
      turnStructure: { type: 'sequential', order: ['devils_advocate', 'facilitator'] },
      completionCriteria: { type: 'turn_count', turns: 2 },
      artifacts: [
        { id: 'critique_notes', label: 'Critique Notes', producedBy: 'devils_advocate' },
      ],
    },
    {
      id: 'synthesis',
      name: 'Synthesis',
      goal: 'Integrate the ideas and critiques into a clear, actionable recommendation or set of next steps.',
      roles: ['synthesizer', 'facilitator'],
      turnStructure: { type: 'single', role: 'synthesizer' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [
        { id: 'synthesis_output', label: 'Final Synthesis', producedBy: 'synthesizer' },
      ],
    },
  ],
};

export const PROCESS_TEMPLATES: Record<string, ProcessDefinition> = {
  [STANDARD_BRAINSTORM.id]: STANDARD_BRAINSTORM,
};
