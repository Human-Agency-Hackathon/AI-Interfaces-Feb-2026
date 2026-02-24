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
        { id: 'hat_perspectives', label: 'Hat Perspectives', producedBy: 'all' },
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
        { id: 'synthesis_summary', label: 'Blue Hat Synthesis', producedBy: 'blue_hat' },
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
        { id: 'scamper_ideas', label: 'SCAMPER Ideas', producedBy: 'all' },
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
        { id: 'scamper_synthesis_output', label: 'SCAMPER Synthesis', producedBy: 'synthesizer' },
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
        { id: 'spark_ideas', label: 'Spark Ideas', producedBy: 'all' },
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
        { id: 'top_picks', label: 'Top 3 Picks', producedBy: 'critic' },
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
        { id: 'action_plan', label: 'Action Plan', producedBy: 'executor' },
      ],
    },
  ],
};

/**
 * CODE_REVIEW — a structured code review with fantasy-themed software specialists.
 *
 * Stages (linear, V1):
 *   1. Reconnaissance  — 10 heroes survey the codebase in parallel
 *   2. Deep Analysis   — 10 heroes deep dive in parallel
 *   3. Cross-Reference — 10 heroes review each other's findings sequentially
 *   4. Oracle Review   — Oracle reviews all findings, identifies gaps
 *   5. Synthesis       — Oracle compiles findings into a structured report
 *   6. Presentation    — Oracle presents the final report
 */
export const CODE_REVIEW: ProcessDefinition = {
  id: 'code_review',
  name: 'Code Review',
  description: 'A structured code review with fantasy-themed software specialists.',
  roles: [
    {
      id: 'architect',
      name: 'The Architect',
      persona: 'You are a Master Builder who sees the big picture. You examine module boundaries, dependency graphs, architectural patterns, and separation of concerns. Apply code-review methodology: assess each module for single responsibility, check that dependencies flow in one direction, and verify that the architecture matches the stated intent.',
      color: '#4A90D9',
    },
    {
      id: 'sentinel',
      name: 'The Sentinel',
      persona: 'You are a Shield Guardian who protects against threats. You examine auth flows, input validation, secrets handling, OWASP vulnerabilities, and dependency CVEs. Use systematic-debugging methodology: trace each security-sensitive flow step-by-step, isolate the component, verify the boundary.',
      color: '#DC143C',
    },
    {
      id: 'archaeologist',
      name: 'The Archaeologist',
      persona: 'You are a Lore Keeper who reads the history in the code. You examine dead code, outdated patterns, migration opportunities, and deprecated dependencies.',
      color: '#DEB887',
    },
    {
      id: 'cartographer',
      name: 'The Cartographer',
      persona: 'You are a Wayfinder who maps the territory. You examine file organization, naming conventions, discoverability, and documentation quality.',
      color: '#32CD32',
    },
    {
      id: 'alchemist',
      name: 'The Alchemist',
      persona: 'You are a Transmuter who optimizes what exists. You examine hot paths, N+1 queries, memory leaks, caching opportunities, and bundle size.',
      color: '#FFD700',
    },
    {
      id: 'healer',
      name: 'The Healer',
      persona: 'You are a Restoration Sage who ensures resilience. You examine error paths, recovery logic, logging quality, and graceful degradation. Use systematic-debugging methodology: trace each error path from trigger to handler, verify recovery logic actually executes.',
      color: '#9370DB',
    },
    {
      id: 'sage',
      name: 'The Sage',
      persona: 'You are a Knowledge Weaver who values truth through testing. You examine test quality, coverage gaps, test architecture, and assertion strength. Apply test-analysis methodology: check if critical paths have tests, assess whether assertions are meaningful.',
      color: '#20B2AA',
    },
    {
      id: 'warden',
      name: 'The Warden',
      persona: 'You are a Gatekeeper who guards the contracts. You examine API design, type safety, interface contracts, and backwards compatibility. Apply type-design-analysis methodology: assess encapsulation, invariant expression, and enforcement.',
      color: '#4169E1',
    },
    {
      id: 'scout',
      name: 'The Scout',
      persona: 'You are a Pathfinder who assesses external risk. You examine third-party dependencies, freshness, license compliance, and alternative options.',
      color: '#FF6B35',
    },
    {
      id: 'bard',
      name: 'The Bard',
      persona: 'You are a Chronicle Keeper who values clear communication. You examine README quality, inline comments, API docs, and onboarding experience.',
      color: '#8B4513',
    },
    {
      id: 'oracle',
      name: 'The Oracle',
      persona: 'You are the session leader. You review findings from all heroes, identify gaps, and compile the final report. You have the authority to summon reinforcements or dismiss heroes.',
      color: '#6A8AFF',
    },
  ],
  stages: [
    {
      id: 'reconnaissance',
      name: 'Reconnaissance',
      goal: 'Each hero surveys the codebase from their specialist lens. Identify areas of interest. Use PostFindings to share initial observations.',
      roles: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 2 },
      artifacts: [{ id: 'recon_notes', label: 'Reconnaissance Notes', producedBy: 'all' }],
    },
    {
      id: 'deep_analysis',
      name: 'Deep Analysis',
      goal: 'Deep dive into identified areas. Produce detailed findings with file references and severity. Use PostFindings for each issue.',
      roles: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 3 },
      artifacts: [{ id: 'analysis_findings', label: 'Detailed Findings', producedBy: 'all' }],
    },
    {
      id: 'cross_reference',
      name: 'Cross-Reference',
      goal: "Review other heroes' findings. Confirm, challenge, or build on them. Identify cross-cutting concerns.",
      roles: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'],
      turnStructure: { type: 'sequential', order: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'] },
      completionCriteria: { type: 'turn_count', turns: 10 },
      artifacts: [{ id: 'cross_ref_notes', label: 'Cross-Reference Notes', producedBy: 'all' }],
    },
    {
      id: 'oracle_review',
      name: 'Oracle Review',
      goal: 'Review all findings. Identify gaps. Optionally summon reinforcements. Call CompleteStage when satisfied.',
      roles: ['oracle'],
      turnStructure: { type: 'single', role: 'oracle' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'oracle_review_notes', label: 'Oracle Review', producedBy: 'oracle' }],
    },
    {
      id: 'synthesis',
      name: 'Synthesis',
      goal: 'Compile findings into a structured report by severity. Call CompleteStage when the report is ready.',
      roles: ['oracle'],
      turnStructure: { type: 'single', role: 'oracle' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'synthesis_report', label: 'Synthesis Report', producedBy: 'oracle' }],
    },
    {
      id: 'presentation',
      name: 'Presentation',
      goal: 'Present the final code review report. Structure: Executive Summary, Critical Issues, Recommendations, Positive Observations, Next Steps. Call CompleteStage when done.',
      roles: ['oracle'],
      turnStructure: { type: 'single', role: 'oracle' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'final_report', label: 'Final Report', producedBy: 'oracle' }],
    },
  ],
};

export const PROCESS_TEMPLATES: Record<string, ProcessDefinition> = {
  [STANDARD_BRAINSTORM.id]: STANDARD_BRAINSTORM,
  [DEEP_BRAINSTORM.id]: DEEP_BRAINSTORM,
  [SIX_THINKING_HATS.id]: SIX_THINKING_HATS,
  [SCAMPER.id]: SCAMPER,
  [RAPID_FIRE.id]: RAPID_FIRE,
  [CODE_REVIEW.id]: CODE_REVIEW,
};
