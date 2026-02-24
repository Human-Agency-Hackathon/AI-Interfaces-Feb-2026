/**
 * MCP server factories for agent tool sets.
 *
 * createRpgMcpServer       — original 6-tool set for codebase exploration
 * createBrainstormMcpServer — 3-tool set for brainstorming sessions
 */

import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { CustomToolHandler } from './CustomToolHandler.js';

function makeResult(result: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}

export function createRpgMcpServer(agentId: string, toolHandler: CustomToolHandler) {
  return createSdkMcpServer({
    name: 'rpg',
    version: '1.0.0',
    tools: [
      tool(
        'SummonAgent',
        'Request a new specialist agent when this work exceeds your capacity.',
        {
          name: z.string().describe('Display name for the new agent'),
          role: z.string().describe('Role/specialization (e.g. "TypeScript Expert")'),
          realm: z.string().describe('Directory scope (e.g. "src/api/")'),
          mission: z.string().describe('What this agent should accomplish'),
          priority: z.enum(['low', 'medium', 'high']).describe('Spawn priority'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'SummonAgent',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'RequestHelp',
        'Ask another team member for help or information.',
        {
          target_agent: z.string().describe('Agent ID to ask'),
          question: z.string().describe('Your question'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'RequestHelp',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'PostFindings',
        'Share an important discovery with the entire team.',
        {
          realm: z.string().describe('Directory or area this finding relates to'),
          finding: z.string().describe('The discovery or insight'),
          severity: z.enum(['low', 'medium', 'high']).describe('Importance level'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'PostFindings',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'UpdateKnowledge',
        'Save an insight to your personal knowledge vault for future sessions.',
        {
          insight: z.string().describe('The insight to save'),
          area: z.string().describe('Knowledge area (e.g. "typescript", "testing")'),
          amount: z.number().optional().describe('Expertise increment (default 1)'),
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
        'ClaimQuest',
        'Self-assign a quest/issue to work on.',
        {
          quest_id: z.string().describe('ID of the quest to claim'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'ClaimQuest',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'CompleteQuest',
        'Mark a quest as done with a summary of what you accomplished.',
        {
          quest_id: z.string().describe('ID of the quest to complete'),
          outcome: z.string().optional().describe('Summary of what was accomplished'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'CompleteQuest',
            tool_input: args as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'SealChamber',
        'Signal that you have completed your work for this stage. Call this when your stage output is fully posted and you are ready for the process to advance.',
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

/**
 * Oracle-specific MCP server.
 * Tools: SelectHeroes, SummonReinforcement, DismissHero, PresentReport,
 *        PostFindings, UpdateKnowledge, CompleteStage, SealChamber
 */
export function createOracleMcpServer(agentId: string, toolHandler: CustomToolHandler) {
  return createSdkMcpServer({
    name: 'oracle',
    version: '1.0.0',
    tools: [
      tool(
        'SelectHeroes',
        'Select a set of hero roles to execute the current activity. Call this at the start of a process to define which specialist agents will participate.',
        {
          activityType: z.string().describe('The type of activity being run (e.g. "code_review", "brainstorm")'),
          processId: z.string().describe('Unique identifier for the process instance'),
          heroes: z.array(z.object({
            roleId: z.string().describe('Role identifier for the hero (e.g. "architect", "sentinel")'),
            mission: z.string().describe('What this hero should accomplish in this session'),
          })).describe('List of heroes to summon for this activity'),
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
        'Request an additional specialist hero mid-process when a gap in coverage is identified.',
        {
          roleId: z.string().describe('Role identifier for the reinforcement hero'),
          reason: z.string().describe('Why this additional hero is needed'),
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
        'Dismiss a hero whose work is complete or who is no longer needed for the current process.',
        {
          agentId: z.string().describe('The agent ID of the hero to dismiss'),
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
        'Submit the final synthesized report to the client. Call this when all heroes have completed their work and the Oracle has distilled a comprehensive summary.',
        {
          report: z.string().describe('The full synthesized report in markdown format'),
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

      tool(
        'PostFindings',
        'Share an important discovery with the entire team.',
        {
          finding: z.string().describe('The idea, insight, or critique to share'),
          severity: z.enum(['low', 'medium', 'high']).describe('Importance level: low = background info, medium = notable idea, high = key insight or blocker'),
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
        'Note something important for your own reference. Use for things you want to remember across turns.',
        {
          insight: z.string().describe('The insight to save'),
          area: z.string().describe('Knowledge area (e.g. "process", "findings", "heroes")'),
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
        'Signal that the current stage is complete and the group is ready to move on. Only call this when the stage goal has been clearly met. Include a summary of what was accomplished.',
        {
          summary: z.string().describe('Summary of what was accomplished in this stage'),
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
        'Signal that you have completed your work for this stage. Call this when your stage output is fully posted and you are ready for the process to advance.',
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

/**
 * Brainstorming-specific MCP server.
 * Tools: PostFindings, UpdateKnowledge, CompleteStage
 */
export function createBrainstormMcpServer(agentId: string, toolHandler: CustomToolHandler) {
  return createSdkMcpServer({
    name: 'brainstorm',
    version: '1.0.0',
    tools: [
      tool(
        'PostFindings',
        'Share an idea, insight, or critique with the group. Use this liberally — it\'s how the group builds shared knowledge.',
        {
          finding: z.string().describe('The idea, insight, or critique to share'),
          severity: z.enum(['low', 'medium', 'high']).describe('Importance level: low = background info, medium = notable idea, high = key insight or blocker'),
        },
        async (args) => {
          const result = await toolHandler.handleToolCall({
            tool_name: 'PostFindings',
            tool_input: { ...args, realm: 'brainstorm' } as Record<string, unknown>,
            agent_id: agentId,
          });
          return makeResult(result.result);
        },
      ),

      tool(
        'UpdateKnowledge',
        'Note something important for your own reference. Use for things you want to remember across turns.',
        {
          insight: z.string().describe('The insight to save'),
          area: z.string().describe('Knowledge area (e.g. "problem", "constraints", "ideas")'),
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
        'Signal that the current stage is complete and the group is ready to move on. Only call this when the stage goal has been clearly met. Include a summary of what was accomplished.',
        {
          summary: z.string().describe('Summary of what was accomplished in this stage'),
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
        'Signal that you have completed your work for this stage. Call this when your stage output is fully posted and you are ready for the process to advance.',
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
