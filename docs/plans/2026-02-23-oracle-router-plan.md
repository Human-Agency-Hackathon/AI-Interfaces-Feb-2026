# Oracle Router Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Oracle a real LLM agent that routes between code-review (software heroes) and brainstorming based on user input, with a new OracleManager, CODE_REVIEW process template, and unified `player:submit` entry point.

**Architecture:** The Oracle is a pre-process meta-agent managed by a new `OracleManager` class. It spawns first, analyzes input via MCP tools (`SelectHeroes`, `SummonReinforcement`, `DismissHero`, `PresentReport`), and triggers the appropriate `ProcessController` template. ProcessController itself is unchanged; OracleManager hooks into the existing delegate pattern for inter-stage intervention.

**Tech Stack:** TypeScript, vitest, Claude Agent SDK (`query()`), existing MCP tool pattern (`createSdkMcpServer` + `tool()`), existing ProcessController delegate pattern.

**Design doc:** `docs/plans/2026-02-23-oracle-router-design.md`

---

### Task 1: Add protocol types for Oracle routing

**Files:**
- Modify: `ha-agent-rpg/shared/protocol.ts:401-416` (add `PlayerSubmitMessage` near `StartProcessMessage`)
- Modify: `ha-agent-rpg/shared/protocol.ts:528-546` (add to `ClientMessage` union)
- Modify: `ha-agent-rpg/shared/protocol.ts:548-580` (add to `ServerMessage` union)
- Modify: `ha-agent-rpg/server/src/types.ts` (mirror new types)
- Modify: `ha-agent-rpg/client/src/types.ts` (mirror new types)
- Test: `ha-agent-rpg/server/src/__tests__/protocol-types.test.ts`

**Step 1: Write the failing test**

Add a test to `protocol-types.test.ts` that validates the new message types compile and have the correct shape:

```typescript
describe('Oracle protocol types', () => {
  it('PlayerSubmitMessage has correct shape', () => {
    const msg: PlayerSubmitMessage = {
      type: 'player:submit',
      problem: 'How to improve auth?',
      repoInput: '/path/to/repo',
    };
    expect(msg.type).toBe('player:submit');
    expect(msg.problem).toBe('How to improve auth?');
    expect(msg.repoInput).toBe('/path/to/repo');
  });

  it('PlayerSubmitMessage allows optional fields', () => {
    const problemOnly: PlayerSubmitMessage = { type: 'player:submit', problem: 'test' };
    const repoOnly: PlayerSubmitMessage = { type: 'player:submit', repoInput: '/repo' };
    expect(problemOnly.type).toBe('player:submit');
    expect(repoOnly.type).toBe('player:submit');
  });

  it('OracleDecisionMessage has correct shape', () => {
    const msg: OracleDecisionMessage = {
      type: 'oracle:decision',
      activityType: 'code_review',
      processId: 'code_review',
      heroes: [{ roleId: 'architect', name: 'The Architect', mission: 'Map structure' }],
    };
    expect(msg.type).toBe('oracle:decision');
    expect(msg.heroes).toHaveLength(1);
  });

  it('HeroSummonedMessage has correct shape', () => {
    const msg: HeroSummonedMessage = {
      type: 'hero:summoned',
      agentId: 'sentinel',
      name: 'The Sentinel',
      role: 'Shield Guardian',
    };
    expect(msg.type).toBe('hero:summoned');
  });

  it('HeroDismissedMessage has correct shape', () => {
    const msg: HeroDismissedMessage = {
      type: 'hero:dismissed',
      agentId: 'sentinel',
      reason: 'No longer needed',
    };
    expect(msg.type).toBe('hero:dismissed');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/protocol-types.test.ts`
Expected: FAIL — types not found

**Step 3: Add the new types to `shared/protocol.ts`**

After `StartProcessMessage` (line ~416), add:

```typescript
/**
 * Unified entry point: user submits a problem, repo, or both.
 * The Oracle analyzes the input and decides which activity to run.
 * At least one of problem or repoInput must be provided.
 */
export interface PlayerSubmitMessage {
  type: 'player:submit';
  /** Problem statement for brainstorming. */
  problem?: string;
  /** GitHub HTTPS URL or absolute local path to a codebase. */
  repoInput?: string;
}

/** Emitted when the Oracle has decided what activity to run and which heroes to summon. */
export interface OracleDecisionMessage {
  type: 'oracle:decision';
  activityType: 'brainstorm' | 'code_review' | 'code_brainstorm';
  processId: string;
  heroes: Array<{ roleId: string; name: string; mission: string }>;
}

/** Emitted when a hero is summoned mid-process by the Oracle. */
export interface HeroSummonedMessage {
  type: 'hero:summoned';
  agentId: string;
  name: string;
  role: string;
}

/** Emitted when a hero is dismissed mid-process by the Oracle. */
export interface HeroDismissedMessage {
  type: 'hero:dismissed';
  agentId: string;
  reason: string;
}
```

Add `PlayerSubmitMessage` to the `ClientMessage` union. Add `OracleDecisionMessage`, `HeroSummonedMessage`, `HeroDismissedMessage` to the `ServerMessage` union.

**Step 4: Mirror the types in `server/src/types.ts` and `client/src/types.ts`**

Copy the four new interfaces into both files. Add to the union types in each.

**Step 5: Run test to verify it passes**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/protocol-types.test.ts`
Expected: PASS

**Step 6: Run full type check**

Run: `cd ha-agent-rpg && npm run build -w server && npm run build -w client`
Expected: PASS — no type errors

**Step 7: Commit**

```bash
git add ha-agent-rpg/shared/protocol.ts ha-agent-rpg/server/src/types.ts ha-agent-rpg/client/src/types.ts ha-agent-rpg/server/src/__tests__/protocol-types.test.ts
git commit -m "feat(protocol): add Oracle routing message types — player:submit, oracle:decision, hero:summoned/dismissed"
git push origin main
```

---

### Task 2: Add CODE_REVIEW process template with software hero roster

**Files:**
- Modify: `ha-agent-rpg/shared/process.ts:762-769` (add to `PROCESS_TEMPLATES`)
- Modify: `ha-agent-rpg/server/src/ProcessTemplates.ts` (mirror the new template)
- Test: `ha-agent-rpg/server/src/__tests__/ProcessController.test.ts` (add CODE_REVIEW template tests)

**Step 1: Write the failing test**

Add to `ProcessController.test.ts`:

```typescript
describe('CODE_REVIEW template', () => {
  it('is registered in PROCESS_TEMPLATES', () => {
    expect(PROCESS_TEMPLATES['code_review']).toBeDefined();
  });

  it('has 6 stages', () => {
    const tpl = PROCESS_TEMPLATES['code_review'];
    expect(tpl.stages).toHaveLength(6);
  });

  it('has 10 software hero roles', () => {
    const tpl = PROCESS_TEMPLATES['code_review'];
    expect(tpl.roles).toHaveLength(10);
    const roleIds = tpl.roles.map(r => r.id);
    expect(roleIds).toContain('architect');
    expect(roleIds).toContain('sentinel');
    expect(roleIds).toContain('archaeologist');
    expect(roleIds).toContain('cartographer');
    expect(roleIds).toContain('alchemist');
    expect(roleIds).toContain('healer');
    expect(roleIds).toContain('sage');
    expect(roleIds).toContain('warden');
    expect(roleIds).toContain('scout');
    expect(roleIds).toContain('bard');
  });

  it('stage 0 is Reconnaissance (parallel)', () => {
    const stage = PROCESS_TEMPLATES['code_review'].stages[0];
    expect(stage.id).toBe('reconnaissance');
    expect(stage.turnStructure.type).toBe('parallel');
  });

  it('stage 3 is Oracle Review (single, explicit_signal)', () => {
    const stage = PROCESS_TEMPLATES['code_review'].stages[3];
    expect(stage.id).toBe('oracle_review');
    expect(stage.turnStructure).toEqual({ type: 'single', role: 'oracle' });
    expect(stage.completionCriteria.type).toBe('explicit_signal');
  });

  it('stage 5 is Presentation (single oracle, explicit_signal)', () => {
    const stage = PROCESS_TEMPLATES['code_review'].stages[5];
    expect(stage.id).toBe('presentation');
    expect(stage.turnStructure).toEqual({ type: 'single', role: 'oracle' });
  });
});
```

Update the import to include `PROCESS_TEMPLATES` from `../ProcessTemplates.js`.

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/ProcessController.test.ts`
Expected: FAIL — `PROCESS_TEMPLATES['code_review']` is undefined

**Step 3: Add the CODE_REVIEW template**

Add to `shared/process.ts` before the `PROCESS_TEMPLATES` record (line ~762). The template defines:

- **10 roles** (architect, sentinel, archaeologist, cartographer, alchemist, healer, sage, warden, scout, bard) — each with a persona matching the design doc. Also add an `oracle` role for stages 3 and 5.
- **6 stages**: reconnaissance (parallel, turn_count 2), deep_analysis (parallel, turn_count 3), cross_reference (sequential, turn_count 1), oracle_review (single oracle, explicit_signal), synthesis (single oracle, explicit_signal), presentation (single oracle, explicit_signal).

Note: The stages reference a subset of roles (the Oracle picks which heroes go into each stage at runtime). For the template, list ALL roles in stages 0-2 so ProcessController can drive them. Stages 3-5 only use `oracle`.

```typescript
export const CODE_REVIEW: ProcessDefinition = {
  id: 'code_review',
  name: 'Code Review',
  description: 'A structured code review with fantasy-themed software specialists: reconnaissance, deep analysis, cross-referencing, Oracle synthesis, and final report.',

  roles: [
    {
      id: 'architect',
      name: 'The Architect',
      persona: 'You are a Master Builder who sees the big picture. You examine module boundaries, dependency graphs, architectural patterns, and separation of concerns. You ask: does this codebase have a clear structure, or is it a tangled web?',
      color: '#4A90D9',
    },
    {
      id: 'sentinel',
      name: 'The Sentinel',
      persona: 'You are a Shield Guardian who protects against threats. You examine auth flows, input validation, secrets handling, OWASP vulnerabilities, and dependency CVEs. You ask: where can an attacker get in?',
      color: '#DC143C',
    },
    {
      id: 'archaeologist',
      name: 'The Archaeologist',
      persona: 'You are a Lore Keeper who reads the history in the code. You examine dead code, outdated patterns, migration opportunities, and deprecated dependencies. You ask: what technical debt is hiding here?',
      color: '#DEB887',
    },
    {
      id: 'cartographer',
      name: 'The Cartographer',
      persona: 'You are a Wayfinder who maps the territory. You examine file organization, naming conventions, discoverability, and documentation quality. You ask: can a new developer find their way around?',
      color: '#32CD32',
    },
    {
      id: 'alchemist',
      name: 'The Alchemist',
      persona: 'You are a Transmuter who optimizes what exists. You examine hot paths, N+1 queries, memory leaks, caching opportunities, and bundle size. You ask: where is this codebase wasting resources?',
      color: '#FFD700',
    },
    {
      id: 'healer',
      name: 'The Healer',
      persona: 'You are a Restoration Sage who ensures resilience. You examine error paths, recovery logic, logging quality, and graceful degradation. You ask: what happens when things go wrong?',
      color: '#9370DB',
    },
    {
      id: 'sage',
      name: 'The Sage',
      persona: 'You are a Knowledge Weaver who values truth through testing. You examine test quality, coverage gaps, test architecture, and assertion strength. You ask: how confident can we be that this code works?',
      color: '#20B2AA',
    },
    {
      id: 'warden',
      name: 'The Warden',
      persona: 'You are a Gatekeeper who guards the contracts. You examine API design, type safety, interface contracts, and backwards compatibility. You ask: are the boundaries between modules well-defined and enforced?',
      color: '#4169E1',
    },
    {
      id: 'scout',
      name: 'The Scout',
      persona: 'You are a Pathfinder who assesses external risk. You examine third-party dependencies, freshness, license compliance, and alternative options. You ask: are we relying on anything that could hurt us?',
      color: '#FF6B35',
    },
    {
      id: 'bard',
      name: 'The Bard',
      persona: 'You are a Chronicle Keeper who values clear communication. You examine README quality, inline comments, API docs, and onboarding experience. You ask: can someone understand this codebase from the docs alone?',
      color: '#8B4513',
    },
    {
      id: 'oracle',
      name: 'The Oracle',
      persona: 'You are the session leader. You review findings from all heroes, identify gaps, and compile the final report. You have the authority to summon reinforcements or dismiss heroes as needed.',
      color: '#6A8AFF',
    },
  ],

  stages: [
    {
      id: 'reconnaissance',
      name: 'Reconnaissance',
      goal: 'Each hero surveys the codebase from their specialist lens. Perform a broad scan to identify areas of interest for deep analysis. Use PostFindings to share initial observations.',
      roles: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 2 },
      artifacts: [{ id: 'recon_notes', label: 'Reconnaissance Notes', producedBy: 'all' }],
    },
    {
      id: 'deep_analysis',
      name: 'Deep Analysis',
      goal: 'Each hero dives deep into the areas they identified during reconnaissance. Produce detailed findings with specific file references, code examples, and severity assessments. Use PostFindings for each issue found.',
      roles: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'],
      turnStructure: { type: 'parallel' },
      completionCriteria: { type: 'turn_count', turns: 3 },
      artifacts: [{ id: 'analysis_findings', label: 'Detailed Findings', producedBy: 'all' }],
    },
    {
      id: 'cross_reference',
      name: 'Cross-Reference',
      goal: 'Review other heroes\' findings. Confirm, challenge, or build on them. Identify cross-cutting concerns that span multiple specialties. Use PostFindings for cross-references and combined insights.',
      roles: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'],
      turnStructure: { type: 'sequential', order: ['architect', 'sentinel', 'archaeologist', 'cartographer', 'alchemist', 'healer', 'sage', 'warden', 'scout', 'bard'] },
      completionCriteria: { type: 'turn_count', turns: 10 },
      artifacts: [{ id: 'cross_ref_notes', label: 'Cross-Reference Notes', producedBy: 'all' }],
    },
    {
      id: 'oracle_review',
      name: 'Oracle Review',
      goal: 'Review all findings from the heroes. Identify gaps in coverage. Optionally summon reinforcement heroes for areas that need more attention. Call CompleteStage when satisfied with the findings.',
      roles: ['oracle'],
      turnStructure: { type: 'single', role: 'oracle' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'oracle_review_notes', label: 'Oracle Review', producedBy: 'oracle' }],
    },
    {
      id: 'synthesis',
      name: 'Synthesis',
      goal: 'Compile all findings into a structured report. Organize by severity: critical issues, important recommendations, minor suggestions, and positive observations. Call CompleteStage when the report is ready.',
      roles: ['oracle'],
      turnStructure: { type: 'single', role: 'oracle' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'synthesis_report', label: 'Synthesis Report', producedBy: 'oracle' }],
    },
    {
      id: 'presentation',
      name: 'Presentation',
      goal: 'Present the final code review report to the user. Structure: (1) Executive Summary, (2) Critical Issues, (3) Recommendations, (4) Positive Observations, (5) Suggested Next Steps. Be clear, actionable, and prioritized. Call CompleteStage when done.',
      roles: ['oracle'],
      turnStructure: { type: 'single', role: 'oracle' },
      completionCriteria: { type: 'explicit_signal' },
      artifacts: [{ id: 'final_report', label: 'Final Report', producedBy: 'oracle' }],
    },
  ],
};
```

Add `CODE_REVIEW` to the `PROCESS_TEMPLATES` record:
```typescript
export const PROCESS_TEMPLATES: Record<string, ProcessDefinition> = {
  [STANDARD_BRAINSTORM.id]: STANDARD_BRAINSTORM,
  [DEEP_BRAINSTORM.id]: DEEP_BRAINSTORM,
  [SIX_THINKING_HATS.id]: SIX_THINKING_HATS,
  [SCAMPER.id]: SCAMPER,
  [RAPID_FIRE.id]: RAPID_FIRE,
  [CODE_REVIEW.id]: CODE_REVIEW,
};
```

Mirror the identical `CODE_REVIEW` definition in `server/src/ProcessTemplates.ts` and add it to that file's `PROCESS_TEMPLATES`.

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/ProcessController.test.ts`
Expected: PASS

**Step 5: Run type check**

Run: `cd ha-agent-rpg && npm run build -w server`
Expected: PASS

**Step 6: Commit**

```bash
git add ha-agent-rpg/shared/process.ts ha-agent-rpg/server/src/ProcessTemplates.ts ha-agent-rpg/server/src/__tests__/ProcessController.test.ts
git commit -m "feat(process): add CODE_REVIEW template with 10 software hero personas and 6-stage process"
git push origin main
```

---

### Task 3: Add Oracle MCP tools (`createOracleMcpServer`)

**Files:**
- Modify: `ha-agent-rpg/server/src/RpgMcpServer.ts` (add `createOracleMcpServer` function)
- Modify: `ha-agent-rpg/server/src/CustomToolHandler.ts` (add handlers for `SelectHeroes`, `SummonReinforcement`, `DismissHero`, `PresentReport`)
- Test: `ha-agent-rpg/server/src/__tests__/RpgMcpServer.test.ts` (add Oracle tool tests)
- Test: `ha-agent-rpg/server/src/__tests__/CustomToolHandler.test.ts` (add Oracle handler tests)

**Step 1: Write the failing test for CustomToolHandler**

Add to `CustomToolHandler.test.ts`:

```typescript
describe('Oracle tool handlers', () => {
  it('handles SelectHeroes and emits oracle:select-heroes', async () => {
    const events: any[] = [];
    toolHandler.on('oracle:select-heroes', (e: any) => events.push(e));

    const result = await toolHandler.handleToolCall({
      tool_name: 'SelectHeroes',
      tool_input: {
        activityType: 'code_review',
        processId: 'code_review',
        heroes: [
          { roleId: 'architect', mission: 'Map the architecture' },
          { roleId: 'sentinel', mission: 'Find security issues' },
        ],
      },
      agent_id: 'oracle',
    });

    expect(result.result.acknowledged).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].heroes).toHaveLength(2);
  });

  it('handles SummonReinforcement and emits oracle:summon-reinforcement', async () => {
    const events: any[] = [];
    toolHandler.on('oracle:summon-reinforcement', (e: any) => events.push(e));

    const result = await toolHandler.handleToolCall({
      tool_name: 'SummonReinforcement',
      tool_input: {
        roleId: 'healer',
        reason: 'Error handling issues found that need specialist attention',
      },
      agent_id: 'oracle',
    });

    expect(result.result.acknowledged).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].roleId).toBe('healer');
  });

  it('handles DismissHero and emits oracle:dismiss-hero', async () => {
    const events: any[] = [];
    toolHandler.on('oracle:dismiss-hero', (e: any) => events.push(e));

    const result = await toolHandler.handleToolCall({
      tool_name: 'DismissHero',
      tool_input: {
        agentId: 'scout',
        reason: 'No dependency issues found, not needed for remaining stages',
      },
      agent_id: 'oracle',
    });

    expect(result.result.acknowledged).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].agentId).toBe('scout');
  });

  it('handles PresentReport and emits oracle:present-report', async () => {
    const events: any[] = [];
    toolHandler.on('oracle:present-report', (e: any) => events.push(e));

    const result = await toolHandler.handleToolCall({
      tool_name: 'PresentReport',
      tool_input: {
        report: '## Executive Summary\nThe codebase is well-structured...',
      },
      agent_id: 'oracle',
    });

    expect(result.result.acknowledged).toBe(true);
    expect(events).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/CustomToolHandler.test.ts`
Expected: FAIL — unknown tool handlers

**Step 3: Add Oracle tool handlers to `CustomToolHandler.ts`**

In the `handleToolCall` switch statement, add four new cases:

```typescript
case 'SelectHeroes':
  return this.handleSelectHeroes(agent_id, tool_input);

case 'SummonReinforcement':
  return this.handleSummonReinforcement(agent_id, tool_input);

case 'DismissHero':
  return this.handleDismissHero(agent_id, tool_input);

case 'PresentReport':
  return this.handlePresentReport(agent_id, tool_input);
```

Add the handler methods:

```typescript
private handleSelectHeroes(agentId: string, input: Record<string, unknown>): CustomToolResult {
  const { activityType, processId, heroes } = input as {
    activityType: string;
    processId: string;
    heroes: Array<{ roleId: string; mission: string }>;
  };
  this.emit('oracle:select-heroes', { agentId, activityType, processId, heroes });
  return { result: { acknowledged: true, message: `Selected ${heroes.length} heroes for ${activityType}.` } };
}

private handleSummonReinforcement(agentId: string, input: Record<string, unknown>): CustomToolResult {
  const { roleId, reason } = input as { roleId: string; reason: string };
  this.emit('oracle:summon-reinforcement', { agentId, roleId, reason });
  return { result: { acknowledged: true, message: `Reinforcement requested: ${roleId}.` } };
}

private handleDismissHero(agentId: string, input: Record<string, unknown>): CustomToolResult {
  const { agentId: heroId, reason } = input as { agentId: string; reason: string };
  this.emit('oracle:dismiss-hero', { agentId, heroId, reason });
  return { result: { acknowledged: true, message: `Hero ${heroId} dismissed.` } };
}

private handlePresentReport(agentId: string, input: Record<string, unknown>): CustomToolResult {
  const { report } = input as { report: string };
  this.emit('oracle:present-report', { agentId, report });
  return { result: { acknowledged: true, message: 'Report submitted.' } };
}
```

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/CustomToolHandler.test.ts`
Expected: PASS

**Step 5: Add `createOracleMcpServer` to `RpgMcpServer.ts`**

Add a new factory function after `createBrainstormMcpServer`:

```typescript
/**
 * Oracle-specific MCP server.
 * Tools: SelectHeroes, SummonReinforcement, DismissHero, PresentReport, PostFindings, UpdateKnowledge, CompleteStage, SealChamber
 */
export function createOracleMcpServer(agentId: string, toolHandler: CustomToolHandler) {
  return createSdkMcpServer({
    name: 'oracle',
    version: '1.0.0',
    tools: [
      tool(
        'SelectHeroes',
        'Declare which heroes to summon and what activity to run. Call this after analyzing the user input.',
        {
          activityType: z.enum(['brainstorm', 'code_review', 'code_brainstorm']).describe('Type of activity to run'),
          processId: z.string().describe('Process template ID to use'),
          heroes: z.array(z.object({
            roleId: z.string().describe('Role ID from the template'),
            mission: z.string().describe('Specific mission brief for this hero'),
          })).describe('Heroes to summon'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'SelectHeroes',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'SummonReinforcement',
        'Summon an additional hero mid-process based on findings.',
        {
          roleId: z.string().describe('Role ID of the hero to summon'),
          reason: z.string().describe('Why this hero is needed'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'SummonReinforcement',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'DismissHero',
        'Dismiss a hero from the active party.',
        {
          agentId: z.string().describe('Agent ID of the hero to dismiss'),
          reason: z.string().describe('Why this hero is being dismissed'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'DismissHero',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'PresentReport',
        'Present the final compiled report to the user.',
        {
          report: z.string().describe('The full report content in markdown'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'PresentReport',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      // Include brainstorm tools so Oracle can post findings and signal stage completion
      tool(
        'PostFindings',
        'Share an observation or insight.',
        {
          finding: z.string().describe('The finding to share'),
          severity: z.enum(['low', 'medium', 'high']).describe('Importance level'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'PostFindings',
            tool_input: { ...args, realm: 'oracle' } as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'UpdateKnowledge',
        'Save an insight to your knowledge vault.',
        {
          insight: z.string().describe('The insight to save'),
          area: z.string().describe('Knowledge area'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'UpdateKnowledge',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'CompleteStage',
        'Signal that the current stage is complete.',
        {
          summary: z.string().describe('Summary of what was accomplished'),
          artifacts: z.record(z.string(), z.string()),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'CompleteStage',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'SealChamber',
        'Signal that you have completed your work for this stage.',
        {
          summary: z.string().describe('One sentence describing what you produced'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'SealChamber',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),
    ],
  });
}
```

**Step 6: Add RpgMcpServer test for Oracle tools**

Add to `RpgMcpServer.test.ts` a test that `createOracleMcpServer` creates a server with the expected tools.

**Step 7: Run all tests**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/CustomToolHandler.test.ts src/__tests__/RpgMcpServer.test.ts`
Expected: PASS

**Step 8: Commit**

```bash
git add ha-agent-rpg/server/src/RpgMcpServer.ts ha-agent-rpg/server/src/CustomToolHandler.ts ha-agent-rpg/server/src/__tests__/CustomToolHandler.test.ts ha-agent-rpg/server/src/__tests__/RpgMcpServer.test.ts
git commit -m "feat(tools): add Oracle MCP tools — SelectHeroes, SummonReinforcement, DismissHero, PresentReport"
git push origin main
```

---

### Task 4: Add Oracle system prompt mode to `SystemPromptBuilder`

**Files:**
- Modify: `ha-agent-rpg/server/src/SystemPromptBuilder.ts` (add oracle prompt mode and code-review hero mode)
- Modify: `ha-agent-rpg/server/src/AgentSessionManager.ts:29-50` (add `oracleContext` field to `ProcessAgentContext` or create separate `OracleAgentContext`)
- Test: `ha-agent-rpg/server/src/__tests__/SystemPromptBuilder.test.ts`

**Step 1: Write the failing test**

Add to `SystemPromptBuilder.test.ts`:

```typescript
describe('Oracle prompt mode', () => {
  it('generates an oracle prompt when oracleContext is present', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Oracle',
      role: 'Session Leader',
      realm: '/',
      mission: 'Analyze the user input and select heroes',
      repoPath: '/test/repo',
      knowledge: null,
      team: [],
      findings: [],
      oracleContext: {
        userProblem: 'How to improve auth?',
        userRepoInput: '/path/to/repo',
        availableRoles: [
          { id: 'architect', name: 'The Architect', persona: 'System structure specialist' },
          { id: 'sentinel', name: 'The Sentinel', persona: 'Security specialist' },
        ],
        availableTemplates: ['code_review', 'standard_brainstorm'],
        phase: 'analysis',
      },
    });

    expect(prompt).toContain('The Oracle');
    expect(prompt).toContain('How to improve auth?');
    expect(prompt).toContain('/path/to/repo');
    expect(prompt).toContain('The Architect');
    expect(prompt).toContain('SelectHeroes');
  });

  it('generates an oracle inter-stage prompt with findings context', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Oracle',
      role: 'Session Leader',
      realm: '/',
      mission: 'Review stage findings and adjust party',
      repoPath: '/test/repo',
      knowledge: null,
      team: [{ agent_id: 'architect', agent_name: 'The Architect', role: 'Master Builder', realm: '/', expertise_summary: 'architecture' }],
      findings: [
        { id: '1', agent_id: 'architect', agent_name: 'The Architect', realm: '/', finding: 'Monolithic structure detected', severity: 'high', timestamp: '' },
      ],
      oracleContext: {
        userProblem: undefined,
        userRepoInput: '/path/to/repo',
        availableRoles: [],
        availableTemplates: [],
        phase: 'inter-stage',
        completedStageName: 'Reconnaissance',
        nextStageName: 'Deep Analysis',
      },
    });

    expect(prompt).toContain('Monolithic structure detected');
    expect(prompt).toContain('SummonReinforcement');
    expect(prompt).toContain('DismissHero');
  });
});

describe('Code review hero prompt mode', () => {
  it('includes file access tools in the prompt', () => {
    const prompt = buildSystemPrompt({
      agentName: 'The Architect',
      role: 'Master Builder',
      realm: '/',
      mission: 'Analyze system architecture',
      repoPath: '/test/repo',
      knowledge: null,
      team: [],
      findings: [],
      processContext: {
        problem: 'Review the codebase',
        processName: 'Code Review',
        stageId: 'reconnaissance',
        stageName: 'Reconnaissance',
        stageGoal: 'Survey the codebase',
        stageIndex: 0,
        totalStages: 6,
        persona: 'You examine module boundaries and architectural patterns.',
        priorArtifacts: {},
        isCodeReview: true,
      },
    });

    expect(prompt).toContain('Read');
    expect(prompt).toContain('Glob');
    expect(prompt).toContain('Grep');
    expect(prompt).not.toContain('Do NOT use Read, Glob, or Grep');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/SystemPromptBuilder.test.ts`
Expected: FAIL — `oracleContext` not recognized

**Step 3: Add `oracleContext` to `PromptContext` and implement the oracle prompt builder**

In `SystemPromptBuilder.ts`, add `oracleContext?: OracleContext` to `PromptContext`. Define `OracleContext`:

```typescript
export interface OracleContext {
  userProblem?: string;
  userRepoInput?: string;
  availableRoles: Array<{ id: string; name: string; persona: string }>;
  availableTemplates: string[];
  phase: 'analysis' | 'inter-stage' | 'final';
  completedStageName?: string;
  nextStageName?: string;
}
```

Update `buildSystemPrompt` to route: if `oracleContext` → `buildOraclePrompt(ctx)`.

Implement `buildOraclePrompt` with three sub-modes based on `phase`:
- `analysis`: User input, available heroes, available templates, instructions to call `SelectHeroes`
- `inter-stage`: Findings so far, active heroes, instructions to call `SummonReinforcement`/`DismissHero` or continue
- `final`: All findings, instructions to call `PresentReport`

Also add `isCodeReview?: boolean` to `ProcessAgentContext` in `AgentSessionManager.ts`. When set, the brainstorm prompt includes file-access tool instructions instead of the "Do NOT use Read, Glob, or Grep" block.

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/SystemPromptBuilder.test.ts`
Expected: PASS

**Step 5: Run full type check**

Run: `cd ha-agent-rpg && npm run build -w server`
Expected: PASS

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/SystemPromptBuilder.ts ha-agent-rpg/server/src/AgentSessionManager.ts ha-agent-rpg/server/src/__tests__/SystemPromptBuilder.test.ts
git commit -m "feat(prompt): add Oracle and code-review hero prompt modes to SystemPromptBuilder"
git push origin main
```

---

### Task 5: Create `OracleManager` class

**Files:**
- Create: `ha-agent-rpg/server/src/OracleManager.ts`
- Test: `ha-agent-rpg/server/src/__tests__/OracleManager.test.ts`

**Step 1: Write the failing test**

Create `OracleManager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OracleManager } from '../OracleManager.js';

describe('OracleManager', () => {
  let mockSessionManager: any;
  let mockToolHandler: any;
  let mockFindingsBoard: any;
  let oracle: OracleManager;

  beforeEach(() => {
    mockSessionManager = {
      spawnAgent: vi.fn(async () => {}),
      dismissAgent: vi.fn(async () => {}),
      sendFollowUp: vi.fn(async () => {}),
      getSession: vi.fn(() => ({ status: 'idle' })),
      getVault: vi.fn(),
      getTeamRoster: vi.fn(() => []),
      on: vi.fn(),
      emit: vi.fn(),
    };
    mockToolHandler = {
      on: vi.fn(),
      emit: vi.fn(),
    };
    mockFindingsBoard = {
      getRecent: vi.fn(async () => []),
    };
    oracle = new OracleManager(mockSessionManager, mockToolHandler, mockFindingsBoard);
  });

  describe('spawn()', () => {
    it('spawns an Oracle agent session', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'How to improve auth?',
        repoInput: '/test/repo',
        permissionLevel: 'read-only',
      });

      expect(mockSessionManager.spawnAgent).toHaveBeenCalledTimes(1);
      const config = mockSessionManager.spawnAgent.mock.calls[0][0];
      expect(config.agentId).toBe('oracle');
      expect(config.agentName).toBe('The Oracle');
    });

    it('throws if Oracle is already spawned', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });

      await expect(oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test2',
        permissionLevel: 'read-only',
      })).rejects.toThrow('Oracle is already active');
    });
  });

  describe('isActive()', () => {
    it('returns false before spawn', () => {
      expect(oracle.isActive()).toBe(false);
    });

    it('returns true after spawn', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });
      expect(oracle.isActive()).toBe(true);
    });
  });

  describe('dismiss()', () => {
    it('dismisses the Oracle session', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });
      await oracle.dismiss();
      expect(mockSessionManager.dismissAgent).toHaveBeenCalledWith('oracle');
      expect(oracle.isActive()).toBe(false);
    });
  });

  describe('feedInterStageContext()', () => {
    it('sends a follow-up prompt to the Oracle with stage info', async () => {
      await oracle.spawn({
        repoPath: '/test/repo',
        problem: 'test',
        permissionLevel: 'read-only',
      });

      await oracle.feedInterStageContext('Reconnaissance', 'Deep Analysis');

      expect(mockSessionManager.sendFollowUp).toHaveBeenCalledTimes(1);
      const prompt = mockSessionManager.sendFollowUp.mock.calls[0][1];
      expect(prompt).toContain('Reconnaissance');
      expect(prompt).toContain('Deep Analysis');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/OracleManager.test.ts`
Expected: FAIL — module not found

**Step 3: Implement `OracleManager`**

Create `ha-agent-rpg/server/src/OracleManager.ts`:

```typescript
/**
 * OracleManager — manages the Oracle agent lifecycle.
 *
 * The Oracle is a meta-agent that:
 * 1. Analyzes user input (repo, problem, or both)
 * 2. Decides which activity type to run (brainstorm, code review, code brainstorm)
 * 3. Selects heroes from the appropriate roster
 * 4. Stays alive throughout the process, receiving inter-stage updates
 * 5. Can summon reinforcements or dismiss heroes mid-process
 * 6. Compiles and presents the final report
 */

import { EventEmitter } from 'node:events';
import type { AgentSessionManager, AgentSessionConfig } from './AgentSessionManager.js';
import type { CustomToolHandler } from './CustomToolHandler.js';
import type { FindingsBoard } from './FindingsBoard.js';
import type { RoleDefinition } from './ProcessTemplates.js';

export interface OracleSpawnConfig {
  repoPath: string;
  problem?: string;
  repoInput?: string;
  permissionLevel: AgentSessionConfig['permissionLevel'];
}

export class OracleManager extends EventEmitter {
  private sessionManager: AgentSessionManager;
  private toolHandler: CustomToolHandler;
  private findingsBoard: FindingsBoard;
  private active = false;
  private spawnConfig: OracleSpawnConfig | null = null;

  constructor(
    sessionManager: AgentSessionManager,
    toolHandler: CustomToolHandler,
    findingsBoard: FindingsBoard,
  ) {
    super();
    this.sessionManager = sessionManager;
    this.toolHandler = toolHandler;
    this.findingsBoard = findingsBoard;
    this.wireToolEvents();
  }

  async spawn(config: OracleSpawnConfig): Promise<void> {
    if (this.active) {
      throw new Error('Oracle is already active');
    }

    this.spawnConfig = config;
    this.active = true;

    const inputDescription = this.describeInput(config);

    await this.sessionManager.spawnAgent({
      agentId: 'oracle',
      agentName: 'The Oracle',
      role: 'Session Leader',
      realm: '/',
      mission: `Analyze the user's submission and decide which heroes to summon.\n\nUSER INPUT:\n${inputDescription}\n\nCall SelectHeroes when you have decided.`,
      repoPath: config.repoPath,
      permissionLevel: config.permissionLevel,
      oracleContext: {
        userProblem: config.problem,
        userRepoInput: config.repoInput,
        availableRoles: [],  // Populated by SystemPromptBuilder from template
        availableTemplates: [],
        phase: 'analysis' as const,
      },
    });
  }

  isActive(): boolean {
    return this.active;
  }

  async dismiss(): Promise<void> {
    if (!this.active) return;
    await this.sessionManager.dismissAgent('oracle');
    this.active = false;
    this.spawnConfig = null;
  }

  async feedInterStageContext(completedStageName: string, nextStageName: string): Promise<void> {
    if (!this.active) return;

    const findings = await this.findingsBoard.getRecent(30);
    const findingsSummary = findings.map(f => `- [${f.agent_name}] ${f.finding}`).join('\n');

    const prompt = `[INTER-STAGE UPDATE] Stage "${completedStageName}" is complete. Next stage: "${nextStageName}".

FINDINGS SO FAR:
${findingsSummary || '(none yet)'}

Review the findings. You may:
- Call SummonReinforcement to add a hero for the next stage
- Call DismissHero to remove a hero that is no longer needed
- Or do nothing if the party composition is fine

The next stage will begin after you respond.`;

    await this.sessionManager.sendFollowUp('oracle', prompt);
  }

  private describeInput(config: OracleSpawnConfig): string {
    const parts: string[] = [];
    if (config.problem) parts.push(`Problem statement: ${config.problem}`);
    if (config.repoInput) parts.push(`Repository: ${config.repoInput}`);
    return parts.join('\n');
  }

  private wireToolEvents(): void {
    this.toolHandler.on('oracle:select-heroes', (data: any) => {
      this.emit('oracle:decision', data);
    });
    this.toolHandler.on('oracle:summon-reinforcement', (data: any) => {
      this.emit('oracle:summon', data);
    });
    this.toolHandler.on('oracle:dismiss-hero', (data: any) => {
      this.emit('oracle:dismiss', data);
    });
    this.toolHandler.on('oracle:present-report', (data: any) => {
      this.emit('oracle:report', data);
    });
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/OracleManager.test.ts`
Expected: PASS

**Step 5: Run type check**

Run: `cd ha-agent-rpg && npm run build -w server`
Expected: PASS

**Step 6: Commit**

```bash
git add ha-agent-rpg/server/src/OracleManager.ts ha-agent-rpg/server/src/__tests__/OracleManager.test.ts
git commit -m "feat(oracle): add OracleManager — Oracle agent lifecycle, inter-stage feeding, tool event wiring"
git push origin main
```

---

### Task 6: Wire OracleManager into BridgeServer with `player:submit` handler

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (add `handlePlayerSubmit`, wire OracleManager events, modify `spawnProcessAgents` for code-review mode)
- Test: `ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts` (add player:submit integration test)

**Step 1: Write the failing test**

Add to `BridgeServer.e2e.test.ts`:

```typescript
describe('player:submit', () => {
  it('spawns the Oracle when a player submits input', async () => {
    const messages: any[] = [];
    clientWs.on('message', (data: Buffer) => {
      messages.push(JSON.parse(data.toString()));
    });

    clientWs.send(JSON.stringify({
      type: 'player:submit',
      repoInput: '/tmp/test-repo',
    }));

    // Wait for Oracle to be spawned (checking for agent:joined with oracle id)
    await waitForMessage(messages, (m: any) => m.type === 'agent:joined' && m.agent?.agent_id === 'oracle', 5000);

    const oracleJoined = messages.find((m: any) => m.type === 'agent:joined' && m.agent?.agent_id === 'oracle');
    expect(oracleJoined).toBeDefined();
    expect(oracleJoined.agent.name).toBe('The Oracle');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/BridgeServer.e2e.test.ts`
Expected: FAIL — `player:submit` not handled

**Step 3: Add `handlePlayerSubmit` to BridgeServer**

In BridgeServer's message router (the switch statement in the WebSocket message handler), add:

```typescript
case 'player:submit':
  this.handlePlayerSubmit(ws, msg as unknown as PlayerSubmitMessage);
  break;
```

Implement `handlePlayerSubmit`:

```typescript
private async handlePlayerSubmit(ws: WebSocket, msg: PlayerSubmitMessage): Promise<void> {
  try {
    if (!msg.problem?.trim() && !msg.repoInput?.trim()) {
      ws.send(JSON.stringify({ type: 'process:error', message: 'Provide a problem, a repo path, or both.' }));
      return;
    }

    this.gamePhase = 'analyzing';
    await this.cleanupCurrentRealm();

    // Resolve repo path if provided
    let resolvedRepoDir: string | null = null;
    if (msg.repoInput?.trim()) {
      resolvedRepoDir = await resolveRepoPath(msg.repoInput.trim());
    }
    const workDir = resolvedRepoDir ?? process.env.HOME ?? '/tmp';
    this.repoPath = workDir;
    this.activeRealmId = `oracle_${Date.now()}`;
    this.realmRegistry.setLastActiveRealmId(this.activeRealmId);
    await this.realmRegistry.save();

    // Fresh world state
    this.worldState = new WorldState();

    // Generate fog-of-war map (use max 8 placeholder forts; actual heroes TBD by Oracle)
    const placeholderIds = ['oracle', 'hero_1', 'hero_2', 'hero_3', 'hero_4', 'hero_5', 'hero_6', 'hero_7'];
    const fogResult = this.mapGenerator.generateFogMap(placeholderIds);
    this.worldState.setMap(fogResult.map);
    this.worldState.initFogMap(fogResult.map.width, fogResult.map.height);
    this.fogBiomeMap = fogResult.biomeMap;
    this.agentFortAssignments = fogResult.fortPositions;

    // Reveal Oracle center
    const oracleRevealed = this.worldState.revealTiles(60, 60, 15);
    if (oracleRevealed.length > 0) {
      this.broadcast({ type: 'fog:reveal', tiles: oracleRevealed, agentId: 'oracle' } as ServerMessage);
    }

    // Infrastructure
    this.findingsBoard = new FindingsBoard(workDir);
    await this.findingsBoard.load();
    this.transcriptLogger = new TranscriptLogger(workDir);
    this.toolHandler = new CustomToolHandler(
      this.findingsBoard,
      this.questManager,
      (agentId: string) => this.sessionManager.getVault(agentId),
      (agentId: string) => {
        const session = this.sessionManager.getSession(agentId);
        return session?.config.agentName ?? agentId;
      },
    );
    this.wireToolHandlerEvents();
    this.sessionManager = new AgentSessionManager(this.findingsBoard, this.toolHandler);
    this.wireSessionManagerEvents();

    // Create OracleManager and wire events
    this.oracleManager = new OracleManager(this.sessionManager, this.toolHandler, this.findingsBoard);
    this.wireOracleManagerEvents();

    this.gamePhase = 'playing';
    this.broadcast(this.buildWorldStateMessage());

    // Spawn the Oracle
    await this.oracleManager.spawn({
      repoPath: workDir,
      problem: msg.problem?.trim(),
      repoInput: msg.repoInput?.trim(),
      permissionLevel: this.settings.permission_level,
    });

    // Add Oracle to world state visually
    const oracleAgent = this.worldState.addAgent('oracle', 'The Oracle', 0x6a8aff, 'Session Leader', '/', { x: 60, y: 60 });
    this.broadcast({ type: 'agent:joined', agent: oracleAgent });

    console.log(`[Bridge] Oracle spawned for player:submit`);
  } catch (err) {
    this.gamePhase = 'onboarding';
    const message = err instanceof Error ? err.message : 'Failed to process submission';
    this.send(ws, { type: 'process:error', message });
  }
}
```

Add `wireOracleManagerEvents` to listen for `oracle:decision` and trigger the appropriate process:

```typescript
private wireOracleManagerEvents(): void {
  if (!this.oracleManager) return;

  this.oracleManager.on('oracle:decision', async (data: any) => {
    const { activityType, processId, heroes } = data;
    const template = PROCESS_TEMPLATES[processId] ?? PROCESS_TEMPLATES['code_review'];

    // Broadcast decision to clients
    this.broadcast({
      type: 'oracle:decision',
      activityType,
      processId,
      heroes: heroes.map((h: any) => ({ roleId: h.roleId, name: template.roles.find((r: any) => r.id === h.roleId)?.name ?? h.roleId, mission: h.mission })),
    });

    // Start the process with the selected template
    const problem = this.oracleManager!['spawnConfig']?.problem ?? `Code review of ${this.repoPath}`;
    const processState: ProcessState = {
      processId: template.id,
      problem,
      currentStageIndex: 0,
      status: 'running',
      collectedArtifacts: {},
      startedAt: new Date().toISOString(),
    };
    this.worldState.setProcessState(processState);

    this.processController = new ProcessController(this.createProcessDelegate());
    this.wireProcessControllerEvents(this.processController);

    // Filter template stages to only include the Oracle-selected heroes
    // For now, spawn all roles in the template stage (Oracle's hero selection informs which agents participate)
    await this.spawnProcessAgents(template, 0, problem);
    this.processController.start(problem, template);

    this.broadcast({
      type: 'process:started',
      processId: template.id,
      problem,
      processName: template.name,
      currentStageId: template.stages[0].id,
      currentStageName: template.stages[0].name,
      totalStages: template.stages.length,
    });
  });

  this.oracleManager.on('oracle:summon', async (data: any) => {
    const { roleId, reason } = data;
    console.log(`[Bridge] Oracle summoning reinforcement: ${roleId} (${reason})`);
    // Spawn the new hero agent
    // Implementation: find role in template, spawn agent, add to world state
    this.broadcast({ type: 'hero:summoned', agentId: roleId, name: roleId, role: roleId });
  });

  this.oracleManager.on('oracle:dismiss', async (data: any) => {
    const { heroId, reason } = data;
    console.log(`[Bridge] Oracle dismissing hero: ${heroId} (${reason})`);
    await this.sessionManager.dismissAgent(heroId);
    this.worldState.removeAgent(heroId);
    this.broadcast({ type: 'hero:dismissed', agentId: heroId, reason });
    this.broadcast({ type: 'agent:left', agent_id: heroId });
  });

  this.oracleManager.on('oracle:report', async (data: any) => {
    console.log(`[Bridge] Oracle presenting final report`);
    // The report content comes through as a finding or artifact
  });
}
```

Add `oracleManager` property to BridgeServer class and import OracleManager.

**Step 4: Run test to verify it passes**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/BridgeServer.e2e.test.ts`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd ha-agent-rpg && npm run test -w server`
Expected: PASS — all existing tests still pass

**Step 6: Run type check**

Run: `cd ha-agent-rpg && npm run build -w server`
Expected: PASS

**Step 7: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts ha-agent-rpg/server/src/__tests__/BridgeServer.e2e.test.ts
git commit -m "feat(bridge): wire OracleManager into BridgeServer with player:submit handler and oracle:decision routing"
git push origin main
```

---

### Task 7: Wire inter-stage Oracle intervention into ProcessController delegate

**Files:**
- Modify: `ha-agent-rpg/server/src/BridgeServer.ts` (update `createProcessDelegate` to call `oracleManager.feedInterStageContext` between stages)
- Modify: `ha-agent-rpg/server/src/AgentSessionManager.ts` (ensure Oracle agent uses `createOracleMcpServer` instead of brainstorm/rpg server)
- Test: `ha-agent-rpg/server/src/__tests__/OracleManager.test.ts` (add inter-stage test)

**Step 1: Write the failing test**

Add to `OracleManager.test.ts`:

```typescript
describe('inter-stage Oracle intervention', () => {
  it('feedInterStageContext sends a follow-up with findings', async () => {
    mockFindingsBoard.getRecent = vi.fn(async () => [
      { id: '1', agent_id: 'architect', agent_name: 'The Architect', realm: '/', finding: 'Monolithic structure', severity: 'high', timestamp: '' },
    ]);

    await oracle.spawn({
      repoPath: '/test/repo',
      problem: 'test',
      permissionLevel: 'read-only',
    });

    await oracle.feedInterStageContext('Reconnaissance', 'Deep Analysis');

    expect(mockSessionManager.sendFollowUp).toHaveBeenCalledTimes(1);
    const [agentId, prompt] = mockSessionManager.sendFollowUp.mock.calls[0];
    expect(agentId).toBe('oracle');
    expect(prompt).toContain('Reconnaissance');
    expect(prompt).toContain('Deep Analysis');
    expect(prompt).toContain('Monolithic structure');
  });
});
```

**Step 2: Run test to verify it passes (already implemented in Task 5)**

Run: `cd ha-agent-rpg && npm run test -w server -- --run src/__tests__/OracleManager.test.ts`
Expected: PASS

**Step 3: Update `createProcessDelegate` in BridgeServer**

In the `onStageAdvanced` callback of `createProcessDelegate`, add an Oracle inter-stage feed:

```typescript
onStageAdvanced: (completedStageId: string, artifacts: Record<string, string>) => {
  // Existing logic...

  // Feed Oracle inter-stage context if OracleManager is active
  if (this.oracleManager?.isActive()) {
    const currentStage = this.processController?.getCurrentStage();
    const template = this.processController?.getContext()?.template;
    if (currentStage && template) {
      const completedStageName = template.stages.find(s => s.id === completedStageId)?.name ?? completedStageId;
      this.oracleManager.feedInterStageContext(completedStageName, currentStage.name).catch(err => {
        console.error('[Bridge] Failed to feed Oracle inter-stage context:', err);
      });
    }
  }
},
```

**Step 4: Update `AgentSessionManager` to route Oracle to the correct MCP server**

In `AgentSessionManager.ts`, in both `runSession` and `runResumedSession`, update the MCP server selection:

```typescript
const mcpServer = config.oracleContext
  ? createOracleMcpServer(config.agentId, this.toolHandler)
  : config.processContext
    ? createBrainstormMcpServer(config.agentId, this.toolHandler)
    : createRpgMcpServer(config.agentId, this.toolHandler);
```

Add `oracleContext` to `AgentSessionConfig`:

```typescript
export interface AgentSessionConfig {
  // ... existing fields
  /** Present when the agent is the Oracle. */
  oracleContext?: OracleContext;
}
```

Import `OracleContext` from `SystemPromptBuilder.ts` and `createOracleMcpServer` from `RpgMcpServer.ts`.

**Step 5: Run full test suite**

Run: `cd ha-agent-rpg && npm run test -w server`
Expected: PASS

**Step 6: Run type check**

Run: `cd ha-agent-rpg && npm run build -w server`
Expected: PASS

**Step 7: Commit**

```bash
git add ha-agent-rpg/server/src/BridgeServer.ts ha-agent-rpg/server/src/AgentSessionManager.ts ha-agent-rpg/server/src/__tests__/OracleManager.test.ts
git commit -m "feat(oracle): wire inter-stage Oracle intervention and Oracle MCP server routing"
git push origin main
```

---

### Task 8: Update client to handle new message types

**Files:**
- Modify: `ha-agent-rpg/client/src/types.ts` (add new message types if not done in Task 1)
- Modify: `ha-agent-rpg/client/src/main.ts` or relevant WebSocket handler (add handlers for `oracle:decision`, `hero:summoned`, `hero:dismissed`)

**Step 1: Identify client WebSocket handler**

Read `client/src/main.ts` to find where server messages are dispatched. The client should already handle `agent:joined` and `agent:left` messages, which cover hero spawning/dismissal visually. New handlers are needed for:
- `oracle:decision` — display a UI notification showing what activity the Oracle chose
- `hero:summoned` — display a summoning notification
- `hero:dismissed` — display a dismissal notification

**Step 2: Add handlers**

In the client's message dispatcher, add cases for the new message types. These should emit events that the UIScene (dialogue log) can display:

```typescript
case 'oracle:decision':
  this.events.emit('oracle:decision', msg);
  break;
case 'hero:summoned':
  this.events.emit('hero:summoned', msg);
  break;
case 'hero:dismissed':
  this.events.emit('hero:dismissed', msg);
  break;
```

In UIScene or DialogueLog, listen for these events and display appropriate text.

**Step 3: Run client type check**

Run: `cd ha-agent-rpg && npm run build -w client`
Expected: PASS

**Step 4: Commit**

```bash
git add ha-agent-rpg/client/src/
git commit -m "feat(client): handle oracle:decision, hero:summoned, hero:dismissed message types"
git push origin main
```

---

### Task 9: Run full test suite, type check, and verify

**Step 1: Run all server tests**

Run: `cd ha-agent-rpg && npm run test -w server`
Expected: ALL PASS

**Step 2: Run all client tests**

Run: `cd ha-agent-rpg && npm run test -w client`
Expected: ALL PASS

**Step 3: Type check everything**

Run: `cd ha-agent-rpg && npm run build -w server && npm run build -w client`
Expected: PASS — no type errors

**Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: resolve any remaining test/type issues from Oracle router integration"
git push origin main
```

---

### Task 10: Update diagrams and documentation

**Files:**
- Modify: `docs/diagrams/system-overview.md` (add Oracle routing flow)
- Modify: `docs/diagrams/agent-lifecycle.md` (add Oracle spawn/dismiss lifecycle)
- Modify: `docs/ARCHITECTURE.md` (mention OracleManager, CODE_REVIEW template)

**Step 1: Add Oracle routing flow to `system-overview.md`**

Add a Mermaid diagram showing the `player:submit` → Oracle analysis → process start flow.

**Step 2: Update `agent-lifecycle.md`**

Add the Oracle as a persistent agent that spans the entire process lifecycle, with spawn at submission and dismiss at process completion.

**Step 3: Update `ARCHITECTURE.md`**

Add a section on OracleManager and the CODE_REVIEW process template.

**Step 4: Commit**

```bash
git add docs/
git commit -m "docs: update diagrams and architecture for Oracle router"
git push origin main
```
