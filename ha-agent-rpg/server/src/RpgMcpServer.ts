/**
 * Creates an in-process MCP server that exposes the 6 custom RPG tools
 * as real Claude tool definitions. Pass the returned config to query()
 * via options.mcpServers.
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
    ],
  });
}
