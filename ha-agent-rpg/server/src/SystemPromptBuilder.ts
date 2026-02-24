import type { AgentKnowledge } from './KnowledgeVault.js';
import type { Finding } from './FindingsBoard.js';
import type { ProcessAgentContext } from './AgentSessionManager.js';

export interface TeamMember {
  agent_id: string;
  agent_name: string;
  role: string;
  realm: string;
  expertise_summary: string;
}

export interface OracleContext {
  userProblem?: string;
  userRepoInput?: string;
  availableRoles: Array<{ id: string; name: string; persona: string }>;
  availableTemplates: string[];
  phase: 'analysis' | 'inter-stage' | 'final';
  completedStageName?: string;
  nextStageName?: string;
}

export interface PromptContext {
  agentName: string;
  role: string;
  realm: string;
  mission: string;
  repoPath: string;
  knowledge: AgentKnowledge | null;
  team: TeamMember[];
  findings: Finding[];
  currentTask?: string;
  /** When set, generates a brainstorming prompt instead of a codebase-exploration prompt. */
  processContext?: ProcessAgentContext;
  /** When set, generates an oracle routing prompt (takes priority over processContext). */
  oracleContext?: OracleContext;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  // Oracle context takes priority over process context
  if (ctx.oracleContext) {
    return buildOraclePrompt(ctx);
  }
  // Route to process-aware prompt when process context is present
  if (ctx.processContext) {
    return buildProcessPrompt(ctx);
  }
  return buildCodebasePrompt(ctx);
}

// ── Oracle routing prompt ─────────────────────────────────────────────────────

function buildOraclePrompt(ctx: PromptContext): string {
  const oc = ctx.oracleContext!;
  const sections: string[] = [];

  if (oc.phase === 'analysis') {
    const inputLines: string[] = [];
    if (oc.userProblem) inputLines.push(`Problem: ${oc.userProblem}`);
    if (oc.userRepoInput) inputLines.push(`Repository: ${oc.userRepoInput}`);

    const rolesText = oc.availableRoles
      .map(r => `- ${r.name} (id: ${r.id}): ${r.persona}`)
      .join('\n');

    const templatesText = oc.availableTemplates.join(', ') || 'none';

    sections.push(`You are ${ctx.agentName}, the session leader.

USER INPUT:
${inputLines.join('\n')}

AVAILABLE HEROES:
${rolesText || '(none)'}

AVAILABLE PROCESS TEMPLATES: ${templatesText}

YOUR TASK: Analyze the user's submission and decide:
1. Which activity type to run (brainstorm, code_review, code_brainstorm)
2. Which heroes to summon (4-6 recommended)
3. A specific mission brief for each hero

Call SelectHeroes with your decision.

ROUTING RULES:
- Repo only → code_review
- Problem only → brainstorm (use standard_brainstorm template)
- Both repo + problem → code_brainstorm`);
  } else if (oc.phase === 'inter-stage') {
    const teamLines = ctx.team.map(t => `- ${t.agent_name} (${t.role})`).join('\n');
    const findingsLines = ctx.findings
      .slice(-15)
      .map(f => `- [${f.agent_name}] (${f.severity}) ${f.finding}`)
      .join('\n');

    sections.push(`You are ${ctx.agentName}, reviewing progress between stages.

COMPLETED STAGE: ${oc.completedStageName ?? '(unknown)'}
NEXT STAGE: ${oc.nextStageName ?? '(unknown)'}

ACTIVE HEROES:
${teamLines || '(none)'}

FINDINGS SO FAR:
${findingsLines || '(none)'}

You may:
- Call SummonReinforcement to add a hero for the next stage
- Call DismissHero to remove a hero that is no longer needed
- Do nothing if the party composition is fine`);
  } else {
    // final
    const findingsLines = ctx.findings
      .slice(-30)
      .map(f => `- [${f.agent_name}] (${f.severity}) ${f.finding}`)
      .join('\n');

    sections.push(`You are ${ctx.agentName}, compiling the final report.

ALL FINDINGS:
${findingsLines || '(none)'}

Call PresentReport with the complete report. Structure:
1. Executive Summary
2. Critical Issues
3. Recommendations
4. Positive Observations
5. Suggested Next Steps`);
  }

  return sections.join('\n\n---\n\n');
}

// ── Brainstorming process prompt ──────────────────────────────────────────────

function buildProcessPrompt(ctx: PromptContext): string {
  const pc = ctx.processContext!;
  const sections: string[] = [];

  sections.push(`You are "${ctx.agentName}", participating in a structured brainstorming session.

PROBLEM: ${pc.problem}

SESSION: ${pc.processName} (stage ${pc.stageIndex + 1} of ${pc.totalStages})
CURRENT STAGE: ${pc.stageName}
STAGE GOAL: ${pc.stageGoal}

YOUR ROLE: ${ctx.role}
YOUR PERSONA: ${pc.persona}

Stay in character. Everything you contribute should serve the stage goal and fit your persona.`);

  // Prior stage artifacts as context
  const priorStageIds = Object.keys(pc.priorArtifacts);
  if (priorStageIds.length > 0) {
    const artifactLines: string[] = [];
    for (const stageId of priorStageIds) {
      const artifacts = pc.priorArtifacts[stageId];
      for (const [artifactId, content] of Object.entries(artifacts)) {
        artifactLines.push(`[${stageId} / ${artifactId}]:\n${content}`);
      }
    }
    sections.push(`CONTEXT FROM PREVIOUS STAGES:\n${artifactLines.join('\n\n')}`);
  }

  if (ctx.team.length > 0) {
    sections.push(`YOUR CO-PARTICIPANTS:
${ctx.team.map(t => `- ${t.agent_name} (${t.role})`).join('\n')}

Engage with their contributions — build on ideas, challenge them, or synthesize across them.`);
  }

  if (ctx.findings.length > 0) {
    sections.push(`IDEAS AND FINDINGS SO FAR:
${ctx.findings.slice(-15).map(f => `- [${f.agent_name}] ${f.finding}`).join('\n')}`);
  }

  if (pc.isCodeReview) {
    sections.push(`## File Access Tools
You have access to file-reading tools for analyzing the codebase:
- **Read**: Read the contents of a file by path
- **Glob**: Find files matching a pattern (e.g., "**/*.ts")
- **Grep**: Search file contents with regex patterns

Use these tools to examine the codebase from your specialist perspective. Reference specific files and line numbers in your findings.`);
  }

  const noFileToolsNote = pc.isCodeReview
    ? ''
    : '\n\nIMPORTANT: Do NOT use Read, Glob, or Grep. This is a brainstorming session — generate ideas from your knowledge and the context above only. File tools are not relevant here.';

  sections.push(`TOOLS AVAILABLE:
- PostFindings: Share an idea, insight, or critique with the group. Use this liberally — it's how the group builds shared knowledge.
- UpdateKnowledge: Note something important for your own reference.
- CompleteStage / SealChamber: Call this when you have finished your contribution for this stage and are ready for the process to advance. Required for stages that end on your signal.${noFileToolsNote}

PLAYER COMMANDS: When you receive a message prefixed with [PLAYER COMMAND], treat it as a direct instruction from the human facilitator. Highest priority — act on it immediately.`);

  return sections.join('\n\n---\n\n');
}

// ── Codebase exploration prompt (original) ────────────────────────────────────

function buildCodebasePrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  sections.push(`You are "${ctx.agentName}", a specialist agent working on the codebase at ${ctx.repoPath}.
Your realm is: ${ctx.realm}
Your mission: ${ctx.mission}

You are part of a self-organizing team of AI agents. You do real engineering work — reading code, analyzing architecture, writing fixes, running tests. Focus on your mission and collaborate with your team.

IMPORTANT BOUNDARY: You MUST only read, search, and modify files within ${ctx.repoPath}. Do NOT access files outside this directory. Do NOT follow paths containing ".." that would escape the repo root. All file paths you use with Read, Glob, Grep, Edit, Write, or Bash tools must stay within ${ctx.repoPath}.`);

  if (ctx.knowledge && (ctx.knowledge.insights.length > 0 || ctx.knowledge.files_analyzed.length > 0)) {
    sections.push(`FROM YOUR PREVIOUS SESSIONS:
Expertise: ${Object.entries(ctx.knowledge.expertise).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None yet'}
Realm knowledge: ${Object.entries(ctx.knowledge.realm_knowledge).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None yet'}
Key insights:
${ctx.knowledge.insights.slice(-10).map(i => `- ${i}`).join('\n') || '- None yet'}
Files you have analyzed: ${ctx.knowledge.files_analyzed.length} files`);
  }

  if (ctx.team.length > 0) {
    sections.push(`YOUR TEAM:
${ctx.team.map(t => `- ${t.agent_name} (${t.role}, realm: ${t.realm}, expertise: ${t.expertise_summary})`).join('\n')}

You can request help from teammates by calling the RequestHelp tool.
You can summon new specialists by calling the SummonAgent tool when the work exceeds your capacity.`);
  } else {
    sections.push(`You are currently the only agent. If the work exceeds your capacity, use the SummonAgent tool to request a specialist.`);
  }

  if (ctx.findings.length > 0) {
    sections.push(`SHARED FINDINGS BOARD:
${ctx.findings.slice(-15).map(f => `- [${f.agent_name}] ${f.finding}`).join('\n')}`);
  }

  if (ctx.currentTask) {
    sections.push(`CURRENT TASK:
${ctx.currentTask}`);
  }

  sections.push(`CUSTOM TOOLS AVAILABLE:
- SummonAgent: Request a new specialist agent when work exceeds your capacity. Provide a name, role, realm (directory scope), and mission.
- RequestHelp: Ask another team member a question. They will respond with their expertise.
- PostFindings: Share an important discovery with the entire team. Use this when you learn something others should know.
- UpdateKnowledge: Save an insight to your personal knowledge vault for future sessions.
- ClaimQuest: Self-assign a quest/issue to work on.
- CompleteQuest: Mark a quest as done with a summary of what you did.

IMPORTANT: After analyzing files or completing tasks, always use UpdateKnowledge to save your key insights and PostFindings to share important discoveries with the team.

PLAYER COMMANDS: When you receive a message prefixed with [PLAYER COMMAND], it is a direct instruction from the human player. Treat it as the highest-priority task. If the player asks you to summon an agent, immediately call SummonAgent with appropriate parameters. If they ask a question, answer it using your tools. Always act on player commands — do not just acknowledge them with text.`);

  return sections.join('\n\n---\n\n');
}
