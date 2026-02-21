import type { Quest, QuestUpdateMessage } from './types.js';

export type QuestStatus = 'open' | 'assigned' | 'in_progress' | 'done';

interface QuestState {
  quest: Quest;
  status: QuestStatus;
  assigned_to?: string; // agent_id
}

export class QuestManager {
  private quests: Map<string, QuestState> = new Map();

  /** Initialize all quests as 'open' with no assignment. */
  loadQuests(quests: Quest[]): void {
    this.quests.clear();
    for (const quest of quests) {
      this.quests.set(quest.quest_id, {
        quest,
        status: 'open',
        assigned_to: undefined,
      });
    }
  }

  /** Assign a quest to an agent. Returns an update message, or null if invalid. */
  assignQuest(questId: string, agentId: string): QuestUpdateMessage | null {
    const state = this.quests.get(questId);
    if (!state) return null;

    // Can only assign quests that are currently open
    if (state.status !== 'open') return null;

    state.status = 'assigned';
    state.assigned_to = agentId;

    return {
      type: 'quest:update',
      quest_id: questId,
      status: 'assigned',
      agent_id: agentId,
    };
  }

  /** Update the status of a quest. Returns an update message, or null if invalid. */
  updateStatus(questId: string, status: QuestStatus): QuestUpdateMessage | null {
    const state = this.quests.get(questId);
    if (!state) return null;

    // Enforce valid transitions
    const validTransitions: Record<QuestStatus, QuestStatus[]> = {
      open: ['assigned'],
      assigned: ['in_progress', 'open'],
      in_progress: ['done', 'assigned'],
      done: [],
    };

    if (!validTransitions[state.status].includes(status)) return null;

    state.status = status;

    // If reverting to open, clear assignment
    if (status === 'open') {
      state.assigned_to = undefined;
    }

    return {
      type: 'quest:update',
      quest_id: questId,
      status,
      agent_id: state.assigned_to,
    };
  }

  /** Get all quests assigned to a specific agent. */
  getQuestsForAgent(agentId: string): Quest[] {
    const results: Quest[] = [];
    for (const state of this.quests.values()) {
      if (state.assigned_to === agentId) {
        results.push(state.quest);
      }
    }
    return results;
  }

  /** Get all unassigned open quests. */
  getOpenQuests(): Quest[] {
    const results: Quest[] = [];
    for (const state of this.quests.values()) {
      if (state.status === 'open') {
        results.push(state.quest);
      }
    }
    return results;
  }

  /** Find quests whose related_files include the given path. */
  getQuestByFile(filePath: string): Quest[] {
    const results: Quest[] = [];
    for (const state of this.quests.values()) {
      if (state.quest.related_files.some((f) => filePath.includes(f) || f.includes(filePath))) {
        results.push(state.quest);
      }
    }
    return results;
  }

  /** Return all quest states (for serialization / debugging). */
  getAllStates(): QuestState[] {
    return Array.from(this.quests.values());
  }

  /** Look up the status of a single quest. */
  getStatus(questId: string): QuestStatus | undefined {
    return this.quests.get(questId)?.status;
  }

  /** Look up who a quest is assigned to. */
  getAssignee(questId: string): string | undefined {
    return this.quests.get(questId)?.assigned_to;
  }
}
