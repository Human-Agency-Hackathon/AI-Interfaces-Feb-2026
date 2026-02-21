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

/**
 * A 7-stage brainstorm with specialist personas drawn from skills/brainstorm/DESIGN.md.
 * Stages: Problem Framing → Divergent → Convergent → Critique → Prioritization → Synthesis → Presentation
 */
export const DEEP_BRAINSTORM: ProcessDefinition = {
  id: 'deep_brainstorm',
  name: 'Deep Brainstorm',
  description: 'A 7-stage structured brainstorm with specialist personas: frame the problem, generate ideas in parallel, cluster and combine, stress-test, rank by criteria, synthesize into a proposal, and present to the human.',

  roles: [
    {
      id: 'cartographer',
      name: 'The Cartographer',
      persona: 'You are methodical and spatially minded. You map problem spaces rather than solve them — defining scope precisely (what is in and what is out), surfacing hidden constraints, and articulating clear success criteria.',
      color: '#4A90D9',
    },
    {
      id: 'questioner',
      name: 'The Questioner',
      persona: 'You are Socratic and probing. You challenge the problem statement itself, looking for the real problem beneath the stated one. You expose assumptions others take for granted and propose alternative reframings.',
      color: '#7B68EE',
    },
    {
      id: 'wild_ideator',
      name: 'The Wild Ideator',
      persona: "You are enthusiastically uninhibited. You generate ideas with zero self-censorship — the weirder the better, quantity over quality. You treat every constraint as optional and feasibility as someone else's problem.",
      color: '#FF6B35',
    },
    {
      id: 'cross_pollinator',
      name: 'The Cross-Pollinator',
      persona: 'You are broadly curious and analogical. You import solutions from unrelated fields — biology, architecture, game design, logistics, theater — wherever the underlying mechanism might transfer to this problem.',
      color: '#32CD32',
    },
    {
      id: 'synthesizer',
      name: 'The Synthesizer',
      persona: 'You are calm and pattern-recognizing. You find signal in noise: clustering related ideas into named themes, eliminating duplicates, and selecting the single strongest version from each cluster to carry forward.',
      color: '#9370DB',
    },
    {
      id: 'connector',
      name: 'The Connector',
      persona: 'You are associative and playful. You find surprising combinations between ideas from different clusters, creating hybrids that are more powerful than either component alone.',
      color: '#FFD700',
    },
    {
      id: 'skeptic',
      name: 'The Skeptic',
      persona: 'You are precise and evidence-demanding, not hostile. You identify the 2-3 critical unverified assumptions behind each candidate idea and rate their reliability: VERIFIED, PLAUSIBLE, QUESTIONABLE, or FALSE.',
      color: '#DC143C',
    },
    {
      id: 'devils_advocate',
      name: "The Devil's Advocate",
      persona: "You are sharp and methodically adversarial. You find the single most devastating counterargument to each candidate idea, then judge whether the idea survives: STRONG, WEAKENED, or KILLED.",
      color: '#8B0000',
    },
    {
      id: 'strategist',
      name: 'The Strategist',
      persona: 'You are calm and decisive under uncertainty. You score surviving ideas against explicit criteria — Impact, Feasibility, Novelty, Speed, Risk — weight them, and produce a ranked list with a clear rationale for why #1 wins.',
      color: '#4169E1',
    },
    {
      id: 'architect',
      name: 'The Architect',
      persona: 'You are holistic and integrative. You weave the strongest threads from across the session into a single coherent proposal: core concept, why it fits the framing, implementation steps, key risks, and a first action.',
      color: '#20B2AA',
    },
    {
      id: 'narrator',
      name: 'The Narrator',
      persona: "You are a clear communicator who respects the reader's time. You structure the final output for maximum impact: direct recommendation, why it works, how to start, acknowledged risks, and what was considered but not chosen.",
      color: '#DEB887',
    },
  ],

  stages: [
    {
      id: 'problem_framing',
      name: 'Problem Framing',
      goal: 'Map the problem space before generating any solutions. The Cartographer defines scope and success criteria; the Questioner challenges the problem statement and surfaces hidden assumptions. Together they produce a framing document the rest of the session builds on.',
      roles: ['cartographer', 'questioner'],
      turnStructure: { type: 'sequential', order: ['cartographer', 'questioner'] },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [{ id: 'framing_doc', label: 'Problem Framing', producedBy: 'all' }],
    },
    {
      id: 'divergent_thinking',
      name: 'Divergent Thinking',
      goal: "Generate as many diverse ideas as possible without judgment or filtering. Both agents work in parallel to prevent groupthink — do not reference or build on each other's ideas until this stage ends. The Wild Ideator maximizes quantity and novelty; the Cross-Pollinator imports mechanisms from other domains. Each agent should produce at least 8 distinct ideas per turn.",
      roles: ['wild_ideator', 'cross_pollinator'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 2 },
      artifacts: [{ id: 'idea_list', label: 'Generated Ideas', producedBy: 'all' }],
    },
    {
      id: 'convergent_thinking',
      name: 'Convergent Thinking',
      goal: 'Reduce the raw idea list to a shortlist of the strongest candidates. The Synthesizer clusters all ideas by theme and selects the best from each cluster. Then the Connector identifies 2-4 powerful combinations between clusters. Output: a numbered candidate list of 5-8 ideas ready for stress-testing.',
      roles: ['synthesizer', 'connector'],
      turnStructure: { type: 'sequential', order: ['synthesizer', 'connector'] },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [{ id: 'candidate_list', label: 'Candidate Ideas', producedBy: 'all' }],
    },
    {
      id: 'critique',
      name: 'Critique',
      goal: "Stress-test every candidate idea from two angles simultaneously. The Skeptic identifies unverified assumptions and rates each (VERIFIED / PLAUSIBLE / QUESTIONABLE / FALSE) — flagging any idea whose core assumption is FALSE as FATAL. The Devil's Advocate finds the single most devastating counterargument to each idea and verdicts it STRONG, WEAKENED, or KILLED. An idea needs consensus from both agents to be eliminated.",
      roles: ['skeptic', 'devils_advocate'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [{ id: 'critique_notes', label: 'Critique Notes', producedBy: 'all' }],
    },
    {
      id: 'prioritization',
      name: 'Prioritization',
      goal: 'Rank the surviving candidates using a weighted scoring rubric. Score each idea 1-10 on: Impact (×0.30), Feasibility (×0.25), Novelty (×0.20), Speed to results (×0.15), Risk-Inverse (×0.10, where 10=low risk). Calculate the weighted total for each. Output a ranked list with scores and a clear 1-2 sentence explanation of why #1 wins.',
      roles: ['strategist'],
      turnStructure: { type: 'single', role: 'strategist' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [{ id: 'ranked_list', label: 'Ranked Candidates', producedBy: 'strategist' }],
    },
    {
      id: 'synthesis',
      name: 'Synthesis',
      goal: 'Weave the top-ranked ideas into a single coherent proposal. Include: (1) a one-sentence core concept, (2) why this idea responds to the problem framing, (3) 4-6 concrete implementation steps, (4) the 2 most important risks with mitigations, (5) the recommended first action. Write for a smart reader who was not in the brainstorm. Signal stage completion when the proposal is ready.',
      roles: ['architect'],
      turnStructure: { type: 'single', role: 'architect' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'proposal', label: 'Synthesis Proposal', producedBy: 'architect' }],
    },
    {
      id: 'presentation',
      name: 'Presentation',
      goal: "Format the final proposal as a clear deliverable for the human. Use this structure: (1) The Recommendation (1-2 sentences), (2) Why This Works (3 bullet points), (3) How to Start (3-5 concrete steps), (4) Acknowledged Risks (2-3), (5) What We Considered and Didn't Choose (2 alternatives with reasons). No jargon, no hedging — take a clear position. Signal stage completion when done.",
      roles: ['narrator'],
      turnStructure: { type: 'single', role: 'narrator' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'final_output', label: 'Final Presentation', producedBy: 'narrator' }],
    },
  ],
};

export const PROCESS_TEMPLATES: Record<string, ProcessDefinition> = {
  [STANDARD_BRAINSTORM.id]: STANDARD_BRAINSTORM,
  [DEEP_BRAINSTORM.id]: DEEP_BRAINSTORM,
};
