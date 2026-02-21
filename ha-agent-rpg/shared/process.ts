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

/** All built-in templates, indexed by id */
export const PROCESS_TEMPLATES: Record<string, ProcessDefinition> = {
  [STANDARD_BRAINSTORM.id]: STANDARD_BRAINSTORM,
};
