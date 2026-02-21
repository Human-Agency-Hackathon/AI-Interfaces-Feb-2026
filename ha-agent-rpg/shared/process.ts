// ══════════════════════════════════════════════════════
//  Agent RPG — Brainstorming Process Schema
//
//  A ProcessDefinition describes a structured brainstorming
//  workflow: which agent roles participate, what each stage
//  asks them to do, and how stages connect to each other.
//
//  V1 scope:
//    - Linear stage sequences only (no branching)
//    - Freeform string artifacts (no typed idea structures)
//    - Turn count or explicit signal for stage completion
//    - Hardcoded process templates (no file-based loading)
//
//  Future tasks will extend this with:
//    - Conditional branching (Task 5)
//    - Typed artifact schemas
//    - File-based process definitions
// ══════════════════════════════════════════════════════

// ── Role ──────────────────────────────────────────────

/**
 * A role is an archetype an agent can occupy. The same role
 * definition can appear across multiple stages (e.g. "Synthesizer"
 * may observe in stage 1 and lead in stage 3).
 */
export interface RoleDefinition {
  /** Stable identifier, e.g. "devils_advocate" */
  id: string;

  /** Display name shown in UI and spoken by the agent, e.g. "Devil's Advocate" */
  name: string;

  /**
   * Injected into the agent's system prompt to shape its personality
   * and approach. Concise — 1-3 sentences. SystemPromptBuilder will
   * wrap this in broader stage/process context.
   */
  persona: string;

  /** Hex color for this role's sprite (optional, falls back to agent's registered color) */
  color?: string;
}

// ── Stage ─────────────────────────────────────────────

/**
 * How turn order works within a stage.
 *
 * - sequential: roles take turns in the specified order, cycling until done
 * - parallel:   all roles act in the same tick (no ordering)
 * - single:     exactly one role acts; others observe
 */
export type TurnStructure =
  | { type: 'sequential'; order: string[] }  // array of role IDs
  | { type: 'parallel' }
  | { type: 'single'; role: string };        // role ID

/**
 * When does a stage end and hand off to the next?
 *
 * - turn_count:      after each participating role has taken N turns
 * - explicit_signal: an agent calls stage:complete (e.g. via a tool)
 */
export type CompletionCriteria =
  | { type: 'turn_count'; turns: number }
  | { type: 'explicit_signal' };

/**
 * An artifact is a named output produced by a stage.
 * Content is freeform text in v1. Downstream stages receive
 * all artifacts from prior stages in their prompt context.
 */
export interface ArtifactDefinition {
  /** Stable identifier, e.g. "initial_ideas" */
  id: string;

  /** Human-readable label for UI display */
  label: string;

  /** Which role produces this artifact (or "all" for aggregated stage output) */
  producedBy: string | 'all';
}

/**
 * A single stage in the process. Stages run in the order they
 * appear in ProcessDefinition.stages (v1 is strictly linear).
 */
export interface StageDefinition {
  /** Stable identifier, e.g. "ideation", "critique", "synthesis" */
  id: string;

  /** Display name, e.g. "Ideation Round" */
  name: string;

  /**
   * What this stage is trying to accomplish. Injected into every
   * participating agent's prompt so they stay focused.
   */
  goal: string;

  /**
   * Role IDs from ProcessDefinition.roles that participate.
   * Roles not listed here are inactive (not spawned / idle) during this stage.
   */
  roles: string[];

  /** Controls who acts and in what order */
  turnStructure: TurnStructure;

  /** Controls when the stage ends */
  completionCriteria: CompletionCriteria;

  /**
   * Named outputs this stage is expected to produce.
   * Agents learn about expected artifacts from their system prompt,
   * and the process engine collects them when the stage completes.
   */
  artifacts: ArtifactDefinition[];
}

// ── Process ───────────────────────────────────────────

/**
 * A ProcessDefinition is the full description of one brainstorming
 * workflow template. It is instantiated into a ProcessState when
 * a user submits a problem statement.
 */
export interface ProcessDefinition {
  /** Stable identifier for this template, e.g. "standard_brainstorm" */
  id: string;

  /** Human-readable name, e.g. "Standard Brainstorm" */
  name: string;

  /** Short description shown to the user when selecting a template */
  description: string;

  /** All roles that can appear anywhere in this process */
  roles: RoleDefinition[];

  /**
   * Stages in execution order. V1: always linear.
   * Stage 0 runs first; the last stage's completion ends the process.
   */
  stages: StageDefinition[];
}

// ── Process State ─────────────────────────────────────

/**
 * A running instance of a ProcessDefinition, seeded with the
 * user's problem statement. Lives in WorldState.
 */
export interface ProcessState {
  /** The template this instance was created from */
  processId: string;

  /** The user's brainstorming problem, verbatim */
  problem: string;

  /** Index into ProcessDefinition.stages for the currently active stage */
  currentStageIndex: number;

  /** Status of the overall process */
  status: 'running' | 'completed' | 'paused';

  /**
   * Artifacts collected so far, keyed by stageId then artifactId.
   * e.g. collectedArtifacts["ideation"]["initial_ideas"] = "..."
   */
  collectedArtifacts: Record<string, Record<string, string>>;

  /** ISO timestamp when this process was started */
  startedAt: string;

  /** ISO timestamp when the process completed (if status === 'completed') */
  completedAt?: string;

  // ── Persistence fields (S1) ──────────────────────────

  /**
   * Original problem text, preserved verbatim for resume.
   * May differ from `problem` if that field gets truncated or reformatted
   * in future versions.
   */
  problemStatement?: string;

  /**
   * Total turns completed per stage, keyed by stage ID.
   * Populated by ProcessController.toJSON() (S2).
   * e.g. { "ideation": 6, "critique": 4 }
   */
  stageTurnCounts?: Record<string, number>;

  /**
   * Turns completed per agent within each stage, keyed as "stageId:agentId".
   * Populated by ProcessController.toJSON() (S2).
   * e.g. { "ideation:wild_ideator_1": 3, "ideation:cross_pollinator_1": 3 }
   */
  agentTurnCounts?: Record<string, number>;

  /**
   * ISO 8601 timestamp for when the current stage started.
   * Used to calculate stage duration on resume.
   */
  stageStartedAt?: string;
}

// ── Built-in Templates ────────────────────────────────

/**
 * The standard 3-stage brainstorm: Ideation → Critique → Synthesis.
 * This is the default template used when no other is specified.
 */
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
        {
          id: 'idea_list',
          label: 'Generated Ideas',
          producedBy: 'ideator',
        },
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
        {
          id: 'critique_notes',
          label: 'Critique Notes',
          producedBy: 'devils_advocate',
        },
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
        {
          id: 'synthesis_output',
          label: 'Final Synthesis',
          producedBy: 'synthesizer',
        },
      ],
    },
  ],
};

/**
 * A 7-stage brainstorm with specialized agent personas drawn from DESIGN.md.
 *
 * Stages (linear, V1):
 *   1. Problem Framing   — Cartographer + Questioner define scope and surface assumptions
 *   2. Divergent         — Wild Ideator + Cross-Pollinator generate in parallel (groupthink prevention)
 *   3. Convergent        — Synthesizer clusters ideas; Connector proposes hybrids
 *   4. Critique          — Skeptic + Devil's Advocate stress-test candidates in parallel
 *   5. Prioritization    — Strategist scores and ranks surviving ideas
 *   6. Synthesis         — Architect writes a coherent proposal from the top ideas
 *   7. Presentation      — Narrator formats the final deliverable for the human
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
      persona: 'You are enthusiastically uninhibited. You generate ideas with zero self-censorship — the weirder the better, quantity over quality. You treat every constraint as optional and feasibility as someone else\'s problem.',
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
      persona: 'You are a clear communicator who respects the reader\'s time. You structure the final output for maximum impact: direct recommendation, why it works, how to start, acknowledged risks, and what was considered but not chosen.',
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
      artifacts: [
        {
          id: 'framing_doc',
          label: 'Problem Framing',
          producedBy: 'all',
        },
      ],
    },

    {
      id: 'divergent_thinking',
      name: 'Divergent Thinking',
      goal: 'Generate as many diverse ideas as possible without judgment or filtering. Both agents work in parallel to prevent groupthink — do not reference or build on each other\'s ideas until this stage ends. The Wild Ideator maximizes quantity and novelty; the Cross-Pollinator imports mechanisms from other domains. Each agent should produce at least 8 distinct ideas per turn.',
      roles: ['wild_ideator', 'cross_pollinator'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 2 },
      artifacts: [
        {
          id: 'idea_list',
          label: 'Generated Ideas',
          producedBy: 'all',
        },
      ],
    },

    {
      id: 'convergent_thinking',
      name: 'Convergent Thinking',
      goal: 'Reduce the raw idea list to a shortlist of the strongest candidates. The Synthesizer clusters all ideas by theme and selects the best from each cluster. Then the Connector identifies 2-4 powerful combinations between clusters. Output: a numbered candidate list of 5-8 ideas ready for stress-testing.',
      roles: ['synthesizer', 'connector'],
      turnStructure: { type: 'sequential', order: ['synthesizer', 'connector'] },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [
        {
          id: 'candidate_list',
          label: 'Candidate Ideas',
          producedBy: 'all',
        },
      ],
    },

    {
      id: 'critique',
      name: 'Critique',
      goal: 'Stress-test every candidate idea from two angles simultaneously. The Skeptic identifies unverified assumptions and rates each (VERIFIED / PLAUSIBLE / QUESTIONABLE / FALSE) — flagging any idea whose core assumption is FALSE as FATAL. The Devil\'s Advocate finds the single most devastating counterargument to each idea and verdicts it STRONG, WEAKENED, or KILLED. An idea needs consensus from both agents to be eliminated.',
      roles: ['skeptic', 'devils_advocate'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [
        {
          id: 'critique_notes',
          label: 'Critique Notes',
          producedBy: 'all',
        },
      ],
    },

    {
      id: 'prioritization',
      name: 'Prioritization',
      goal: 'Rank the surviving candidates using a weighted scoring rubric. Score each idea 1-10 on: Impact (×0.30), Feasibility (×0.25), Novelty (×0.20), Speed to results (×0.15), Risk-Inverse (×0.10, where 10=low risk). Calculate the weighted total for each. Output a ranked list with scores and a clear 1-2 sentence explanation of why #1 wins.',
      roles: ['strategist'],
      turnStructure: { type: 'single', role: 'strategist' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [
        {
          id: 'ranked_list',
          label: 'Ranked Candidates',
          producedBy: 'strategist',
        },
      ],
    },

    {
      id: 'synthesis',
      name: 'Synthesis',
      goal: 'Weave the top-ranked ideas into a single coherent proposal. Include: (1) a one-sentence core concept, (2) why this idea responds to the problem framing, (3) 4-6 concrete implementation steps, (4) the 2 most important risks with mitigations, (5) the recommended first action. Write for a smart reader who was not in the brainstorm. Signal stage completion when the proposal is ready.',
      roles: ['architect'],
      turnStructure: { type: 'single', role: 'architect' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [
        {
          id: 'proposal',
          label: 'Synthesis Proposal',
          producedBy: 'architect',
        },
      ],
    },

    {
      id: 'presentation',
      name: 'Presentation',
      goal: 'Format the final proposal as a clear deliverable for the human. Use this structure: (1) The Recommendation (1-2 sentences), (2) Why This Works (3 bullet points), (3) How to Start (3-5 concrete steps), (4) Acknowledged Risks (2-3), (5) What We Considered and Didn\'t Choose (2 alternatives with reasons). No jargon, no hedging — take a clear position. Signal stage completion when done.',
      roles: ['narrator'],
      turnStructure: { type: 'single', role: 'narrator' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [
        {
          id: 'final_output',
          label: 'Final Presentation',
          producedBy: 'narrator',
        },
      ],
    },
  ],
};

/**
 * Six Thinking Hats — Edward de Bono's parallel thinking method.
 *
 * Stage 1: All 6 hats contribute their perspective in parallel (1 turn each).
 * Stage 2: Blue Hat synthesizes all perspectives and calls CompleteStage when done.
 */
export const SIX_THINKING_HATS: ProcessDefinition = {
  id: 'six_thinking_hats',
  name: 'Six Thinking Hats',
  description: "Edward de Bono's parallel thinking method: six role-players each wear a different colored hat (facts, emotions, caution, optimism, creativity, process) to explore a problem from every angle before synthesizing.",

  roles: [
    {
      id: 'white_hat',
      name: 'White Hat',
      persona: 'You present only verifiable facts and data. No opinions, no speculation.',
      color: '#FFFFFF',
    },
    {
      id: 'red_hat',
      name: 'Red Hat',
      persona: 'You share gut feelings and emotional reactions without justification.',
      color: '#FF3333',
    },
    {
      id: 'black_hat',
      name: 'Black Hat',
      persona: 'You identify risks, problems, and reasons why ideas might fail.',
      color: '#333333',
    },
    {
      id: 'yellow_hat',
      name: 'Yellow Hat',
      persona: 'You find the best-case scenario and articulate the value of ideas.',
      color: '#FFD700',
    },
    {
      id: 'green_hat',
      name: 'Green Hat',
      persona: 'You generate new ideas and alternatives without judgment.',
      color: '#32CD32',
    },
    {
      id: 'blue_hat',
      name: 'Blue Hat',
      persona: 'You manage the thinking process, summarize, and call CompleteStage when the round is done.',
      color: '#4A90D9',
    },
  ],

  stages: [
    {
      id: 'hats_round',
      name: 'Hats Round',
      goal: 'Each hat contributes one focused perspective on the problem: White Hat shares facts, Red Hat shares feelings, Black Hat flags risks, Yellow Hat identifies value, Green Hat proposes new ideas, Blue Hat observes and keeps track of the process. All perspectives are captured before any synthesis.',
      roles: ['white_hat', 'red_hat', 'black_hat', 'yellow_hat', 'green_hat', 'blue_hat'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [
        {
          id: 'hat_perspectives',
          label: 'Hat Perspectives',
          producedBy: 'all',
        },
      ],
    },
    {
      id: 'blue_hat_synthesis',
      name: 'Blue Hat Synthesis',
      goal: 'The Blue Hat synthesizes all six perspectives into a coherent summary: what the facts say, what emotions signal, what risks to watch, what value exists, and what new ideas emerged. Produce a concise action-oriented conclusion and signal stage completion when done.',
      roles: ['blue_hat'],
      turnStructure: { type: 'single', role: 'blue_hat' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [
        {
          id: 'synthesis_summary',
          label: 'Blue Hat Synthesis',
          producedBy: 'blue_hat',
        },
      ],
    },
  ],
};

/**
 * SCAMPER — a structured ideation checklist.
 *
 * Stage 1: 7 roles each apply one SCAMPER lens in parallel (1 turn each).
 * Stage 2: Synthesizer integrates the best ideas from all lenses.
 */
export const SCAMPER: ProcessDefinition = {
  id: 'scamper',
  name: 'SCAMPER',
  description: 'A structured ideation checklist: seven lenses (Substitute, Combine, Adapt, Modify, Put to other uses, Eliminate, Reverse) applied in parallel, then synthesized into the strongest ideas.',

  roles: [
    {
      id: 'substituter',
      name: 'Substituter',
      persona: 'You ask: What can be substituted? Explore replacing components, materials, people, processes, or rules with something else.',
      color: '#FF6B35',
    },
    {
      id: 'combiner',
      name: 'Combiner',
      persona: 'You ask: What can be combined? Look for ways to merge ideas, purposes, units, or appeals for a new outcome.',
      color: '#FFD700',
    },
    {
      id: 'adaptor',
      name: 'Adaptor',
      persona: 'You ask: What can be adapted from elsewhere? Find analogous solutions from other domains, industries, or contexts that could transfer here.',
      color: '#32CD32',
    },
    {
      id: 'modifier',
      name: 'Modifier',
      persona: 'You ask: What can be magnified, minimized, or modified? Explore changes in size, shape, frequency, strength, or any other attribute.',
      color: '#4A90D9',
    },
    {
      id: 'put_to_other_uses',
      name: 'Put-to-Other-Uses',
      persona: 'You ask: How can this be used differently? Find new markets, audiences, or applications for an existing idea or resource.',
      color: '#9370DB',
    },
    {
      id: 'eliminator',
      name: 'Eliminator',
      persona: 'You ask: What can be removed or simplified? Look for components, steps, or features that could be stripped away to reveal the essential core.',
      color: '#DC143C',
    },
    {
      id: 'reverser',
      name: 'Reverser',
      persona: 'You ask: What if we reversed or rearranged it? Flip the order, invert assumptions, or turn the problem upside down to find unexpected solutions.',
      color: '#DEB887',
    },
    {
      id: 'synthesizer',
      name: 'Synthesizer',
      persona: 'You identify the strongest ideas across all seven SCAMPER lenses and weave them into a concise, actionable recommendation. You prioritize ideas with the highest originality and feasibility.',
      color: '#20B2AA',
    },
  ],

  stages: [
    {
      id: 'scamper_ideation',
      name: 'SCAMPER Ideation',
      goal: 'Each agent applies their assigned SCAMPER lens to the problem and generates at least 3-5 concrete ideas from that perspective. All agents work in parallel — do not filter or evaluate yet, just generate.',
      roles: ['substituter', 'combiner', 'adaptor', 'modifier', 'put_to_other_uses', 'eliminator', 'reverser'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [
        {
          id: 'scamper_ideas',
          label: 'SCAMPER Ideas',
          producedBy: 'all',
        },
      ],
    },
    {
      id: 'scamper_synthesis',
      name: 'Synthesis',
      goal: 'Review all ideas from the seven SCAMPER lenses. Identify the top 3-5 ideas with the most promise. For each, explain why it stands out and what a concrete next step would look like. Signal stage completion when done.',
      roles: ['synthesizer'],
      turnStructure: { type: 'single', role: 'synthesizer' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [
        {
          id: 'scamper_synthesis_output',
          label: 'SCAMPER Synthesis',
          producedBy: 'synthesizer',
        },
      ],
    },
  ],
};

/**
 * RAPID_FIRE — a fast 3-stage template for time-constrained sessions.
 *
 * Stage 1: Spark  — 2 ideators post 5 ideas each fast (parallel, 1 turn).
 * Stage 2: Pick   — 1 critic picks the top 3 and explains why (single, 1 turn).
 * Stage 3: Go     — 1 executor turns the winner into a concrete action plan (single, explicit_signal).
 */
export const RAPID_FIRE: ProcessDefinition = {
  id: 'rapid_fire',
  name: 'Rapid Fire',
  description: 'A fast 3-stage template for time-constrained sessions: two ideators spark 5 ideas each simultaneously, a critic picks the top 3, and an executor builds a concrete action plan around the winner.',

  roles: [
    {
      id: 'ideator_a',
      name: 'Ideator A',
      persona: 'You post exactly 5 ideas as fast as possible — numbered, one sentence each. No hedging, no explanation. Raw speed is the goal.',
      color: '#FF6B35',
    },
    {
      id: 'ideator_b',
      name: 'Ideator B',
      persona: 'You post exactly 5 ideas as fast as possible — numbered, one sentence each. No hedging, no explanation. Raw speed is the goal.',
      color: '#FFD700',
    },
    {
      id: 'critic',
      name: 'Critic',
      persona: 'You read all ideas from the Spark stage and pick the top 3. For each, give one sentence explaining why it made the cut. Be decisive — no ties.',
      color: '#DC143C',
    },
    {
      id: 'executor',
      name: 'Executor',
      persona: 'You take the top-ranked idea and turn it into a concrete action plan: what to do first, who does it, what success looks like in 1 week. Be specific and actionable. Signal stage completion when done.',
      color: '#32CD32',
    },
  ],

  stages: [
    {
      id: 'spark',
      name: 'Spark',
      goal: 'Both ideators simultaneously post 5 ideas each — fast, raw, and unfiltered. No discussion, no elaboration. Just get ideas on the board.',
      roles: ['ideator_a', 'ideator_b'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [
        {
          id: 'spark_ideas',
          label: 'Spark Ideas',
          producedBy: 'all',
        },
      ],
    },
    {
      id: 'pick',
      name: 'Pick',
      goal: 'The Critic reads all 10 ideas from the Spark stage and selects the top 3. For each pick, provide one clear sentence explaining why it made the cut over the others.',
      roles: ['critic'],
      turnStructure: { type: 'single', role: 'critic' },
      completionCriteria: { type: 'turn_count', turns: 1 },
      artifacts: [
        {
          id: 'top_picks',
          label: 'Top 3 Picks',
          producedBy: 'critic',
        },
      ],
    },
    {
      id: 'go',
      name: 'Go',
      goal: 'The Executor takes the top-ranked idea from the Pick stage and builds a concrete action plan: (1) the core idea restated in one sentence, (2) the first 3 steps to execute it, (3) who is responsible for each step, (4) what success looks like in one week. Signal stage completion when the plan is ready.',
      roles: ['executor'],
      turnStructure: { type: 'single', role: 'executor' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [
        {
          id: 'action_plan',
          label: 'Action Plan',
          producedBy: 'executor',
        },
      ],
    },
  ],
};

/** All built-in templates, indexed by id */
export const PROCESS_TEMPLATES: Record<string, ProcessDefinition> = {
  [STANDARD_BRAINSTORM.id]: STANDARD_BRAINSTORM,
  [DEEP_BRAINSTORM.id]: DEEP_BRAINSTORM,
  [SIX_THINKING_HATS.id]: SIX_THINKING_HATS,
  [SCAMPER.id]: SCAMPER,
  [RAPID_FIRE.id]: RAPID_FIRE,
};
