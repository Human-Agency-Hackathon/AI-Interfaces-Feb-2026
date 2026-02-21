/**
 * Handles execution of custom tools called by agent sessions.
 *
 * Emitted events:
 *   summon:request    — agent wants a new specialist spawned
 *   help:request      — agent asks another agent for help
 *   findings:posted   — findings shared to the board
 *   knowledge:updated — vault updated with new insight / expertise
 *   quest:claimed     — quest assigned to an agent
 *   quest:completed   — quest marked done
 */

import { EventEmitter } from 'node:events';
import type { FindingsBoard } from './FindingsBoard.js';
import type { KnowledgeVault } from './KnowledgeVault.js';
import type { QuestManager } from './QuestManager.js';

// ── Public interfaces ──

export interface CustomToolCall {
  tool_name: string;
  tool_input: Record<string, unknown>;
  agent_id: string;
}

export interface CustomToolResult {
  result: Record<string, unknown>;
}

// ── Implementation ──

export class CustomToolHandler extends EventEmitter {
  private findingsBoard: FindingsBoard;
  private questManager: QuestManager;
  private getVault: (agentId: string) => KnowledgeVault | undefined;
  private getAgentName: (agentId: string) => string;

  constructor(
    findingsBoard: FindingsBoard,
    questManager: QuestManager,
    getVault: (agentId: string) => KnowledgeVault | undefined,
    getAgentName: (agentId: string) => string,
  ) {
    super();
    this.findingsBoard = findingsBoard;
    this.questManager = questManager;
    this.getVault = getVault;
    this.getAgentName = getAgentName;
  }

  // ── Main dispatch ──

  async handleToolCall(call: CustomToolCall): Promise<CustomToolResult> {
    const { tool_name, tool_input, agent_id } = call;

    switch (tool_name) {
      case 'SummonAgent':
        return this.handleSummonAgent(agent_id, tool_input);

      case 'RequestHelp':
        return this.handleRequestHelp(agent_id, tool_input);

      case 'PostFindings':
        return this.handlePostFindings(agent_id, tool_input);

      case 'UpdateKnowledge':
        return this.handleUpdateKnowledge(agent_id, tool_input);

      case 'ClaimQuest':
        return this.handleClaimQuest(agent_id, tool_input);

      case 'CompleteQuest':
        return this.handleCompleteQuest(agent_id, tool_input);

      default:
        return { result: { error: `Unknown tool: ${tool_name}` } };
    }
  }

  // ── Tool handlers ──

  private handleSummonAgent(
    requestingAgent: string,
    input: Record<string, unknown>,
  ): CustomToolResult {
    const { name, role, realm, mission, priority } = input as {
      name: string;
      role: string;
      realm: string;
      mission: string;
      priority: string;
    };

    this.emit('summon:request', {
      requestingAgent,
      name,
      role,
      realm,
      mission,
      priority,
    });

    return { result: { acknowledged: true, message: 'Spawn request submitted.' } };
  }

  private handleRequestHelp(
    requestingAgent: string,
    input: Record<string, unknown>,
  ): CustomToolResult {
    const { target_agent, question } = input as {
      target_agent: string;
      question: string;
    };

    this.emit('help:request', {
      requestingAgent,
      targetAgent: target_agent,
      question,
    });

    return { result: { acknowledged: true, message: 'Help request sent.' } };
  }

  private async handlePostFindings(
    agentId: string,
    input: Record<string, unknown>,
  ): Promise<CustomToolResult> {
    const { realm, finding, severity } = input as {
      realm: string;
      finding: string;
      severity: 'low' | 'medium' | 'high';
    };

    const agentName = this.getAgentName(agentId);

    const entry = this.findingsBoard.addFinding({
      agent_id: agentId,
      agent_name: agentName,
      realm,
      finding,
      severity,
    });

    await this.findingsBoard.save();

    this.emit('findings:posted', {
      agentId,
      agentName,
      finding: entry,
    });

    return { result: { acknowledged: true, finding_id: entry.id } };
  }

  private async handleUpdateKnowledge(
    agentId: string,
    input: Record<string, unknown>,
  ): Promise<CustomToolResult> {
    const { insight, area, amount } = input as {
      insight: string;
      area: string;
      amount?: number;
    };

    const vault = this.getVault(agentId);
    if (!vault) {
      return { result: { error: `No vault found for agent ${agentId}` } };
    }

    vault.addInsight(insight);
    vault.incrementExpertise(area, amount ?? 1);
    await vault.save();

    this.emit('knowledge:updated', {
      agentId,
      insight,
      area,
    });

    return { result: { saved: true } };
  }

  private handleClaimQuest(
    agentId: string,
    input: Record<string, unknown>,
  ): CustomToolResult {
    const { quest_id } = input as { quest_id: string };

    const update = this.questManager.assignQuest(quest_id, agentId);
    if (!update) {
      return { result: { error: `Cannot assign quest ${quest_id} — not found or not open.` } };
    }

    this.emit('quest:claimed', {
      agentId,
      quest_id,
      update,
    });

    return { result: { assigned: true, quest_id } };
  }

  private async handleCompleteQuest(
    agentId: string,
    input: Record<string, unknown>,
  ): Promise<CustomToolResult> {
    const { quest_id, outcome } = input as {
      quest_id: string;
      outcome?: string;
    };

    const update = this.questManager.updateStatus(quest_id, 'done');
    if (!update) {
      return { result: { error: `Cannot complete quest ${quest_id} — invalid transition.` } };
    }

    // Persist quest completion in the agent's knowledge vault
    const vault = this.getVault(agentId);
    if (vault) {
      vault.addTaskHistory(
        `Completed quest: ${quest_id}`,
        outcome ?? 'done',
      );
      vault.incrementExpertise('quests_completed', 1);
      await vault.save();
    }

    this.emit('quest:completed', {
      agentId,
      quest_id,
      outcome: outcome ?? 'done',
      update,
    });

    return { result: { closed: true, quest_id } };
  }
}
