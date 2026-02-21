import type { AgentKnowledge } from './KnowledgeVault.js';
import type { Finding } from './FindingsBoard.js';

export interface TeamMember {
  agent_id: string;
  agent_name: string;
  role: string;
  realm: string;
  expertise_summary: string;
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
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  sections.push(`You are "${ctx.agentName}", a specialist agent working on the codebase at ${ctx.repoPath}.
Your realm is: ${ctx.realm}
Your mission: ${ctx.mission}

You are part of a self-organizing team of AI agents. You do real engineering work — reading code, analyzing architecture, writing fixes, running tests. Focus on your mission and collaborate with your team.`);

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
