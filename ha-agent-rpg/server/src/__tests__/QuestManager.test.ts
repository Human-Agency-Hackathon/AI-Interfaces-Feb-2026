import { describe, it, expect, beforeEach } from 'vitest';
import { QuestManager } from '../QuestManager.js';
import { makeQuest } from './helpers/fixtures.js';

describe('QuestManager', () => {
  let qm: QuestManager;
  const quest1 = makeQuest({ quest_id: 'q1' });
  const quest2 = makeQuest({
    quest_id: 'q2',
    title: 'Another quest',
    related_files: ['src/api.ts'],
  });

  beforeEach(() => {
    qm = new QuestManager();
    qm.loadQuests([quest1, quest2]);
  });

  describe('loadQuests()', () => {
    it('initializes all quests as open', () => {
      expect(qm.getStatus('q1')).toBe('open');
      expect(qm.getStatus('q2')).toBe('open');
    });

    it('clears previous quests on reload', () => {
      qm.loadQuests([makeQuest({ quest_id: 'q3' })]);
      expect(qm.getStatus('q1')).toBeUndefined();
      expect(qm.getStatus('q3')).toBe('open');
    });
  });

  describe('assignQuest()', () => {
    it('assigns an open quest to an agent', () => {
      const update = qm.assignQuest('q1', 'agent1');
      expect(update).not.toBeNull();
      expect(update!.type).toBe('quest:update');
      expect(update!.status).toBe('assigned');
      expect(update!.agent_id).toBe('agent1');
      expect(update!.quest_id).toBe('q1');
    });

    it('returns null when quest does not exist', () => {
      expect(qm.assignQuest('nonexistent', 'agent1')).toBeNull();
    });

    it('returns null when quest is already assigned', () => {
      qm.assignQuest('q1', 'agent1');
      expect(qm.assignQuest('q1', 'agent2')).toBeNull();
    });

    it('updates the assignee', () => {
      qm.assignQuest('q1', 'agent1');
      expect(qm.getAssignee('q1')).toBe('agent1');
    });
  });

  describe('updateStatus() — state machine transitions', () => {
    it('assigned → in_progress (valid)', () => {
      qm.assignQuest('q1', 'a1');
      const result = qm.updateStatus('q1', 'in_progress');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('in_progress');
    });

    it('assigned → open (valid, clears assignment)', () => {
      qm.assignQuest('q1', 'a1');
      const result = qm.updateStatus('q1', 'open');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('open');
      expect(qm.getAssignee('q1')).toBeUndefined();
    });

    it('in_progress → done (valid)', () => {
      qm.assignQuest('q1', 'a1');
      qm.updateStatus('q1', 'in_progress');
      const result = qm.updateStatus('q1', 'done');
      expect(result).not.toBeNull();
      expect(result!.status).toBe('done');
    });

    it('in_progress → assigned (valid)', () => {
      qm.assignQuest('q1', 'a1');
      qm.updateStatus('q1', 'in_progress');
      const result = qm.updateStatus('q1', 'assigned');
      expect(result).not.toBeNull();
    });

    it('done → anything (invalid, returns null)', () => {
      qm.assignQuest('q1', 'a1');
      qm.updateStatus('q1', 'in_progress');
      qm.updateStatus('q1', 'done');
      expect(qm.updateStatus('q1', 'open')).toBeNull();
      expect(qm.updateStatus('q1', 'assigned')).toBeNull();
      expect(qm.updateStatus('q1', 'in_progress')).toBeNull();
    });

    it('open → done (invalid, returns null)', () => {
      expect(qm.updateStatus('q1', 'done')).toBeNull();
    });

    it('open → in_progress (invalid, returns null)', () => {
      expect(qm.updateStatus('q1', 'in_progress')).toBeNull();
    });

    it('returns null for nonexistent quest', () => {
      expect(qm.updateStatus('nonexistent', 'done')).toBeNull();
    });
  });

  describe('getQuestsForAgent()', () => {
    it('returns quests assigned to the given agent', () => {
      qm.assignQuest('q1', 'a1');
      qm.assignQuest('q2', 'a2');
      const result = qm.getQuestsForAgent('a1');
      expect(result).toHaveLength(1);
      expect(result[0].quest_id).toBe('q1');
    });

    it('returns empty array when no quests assigned', () => {
      expect(qm.getQuestsForAgent('nobody')).toEqual([]);
    });
  });

  describe('getOpenQuests()', () => {
    it('returns all open quests', () => {
      expect(qm.getOpenQuests()).toHaveLength(2);
    });

    it('excludes assigned quests', () => {
      qm.assignQuest('q1', 'a1');
      const open = qm.getOpenQuests();
      expect(open).toHaveLength(1);
      expect(open[0].quest_id).toBe('q2');
    });
  });

  describe('getQuestByFile()', () => {
    it('finds quests whose related_files match the given path', () => {
      const results = qm.getQuestByFile('src/auth/login.ts');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].quest_id).toBe('q1');
    });

    it('matches partial paths bidirectionally', () => {
      const results = qm.getQuestByFile('api.ts');
      expect(results.some((q) => q.quest_id === 'q2')).toBe(true);
    });

    it('returns empty array when no match', () => {
      expect(qm.getQuestByFile('nonexistent.xyz')).toEqual([]);
    });
  });

  describe('getAllStates()', () => {
    it('returns all quest states', () => {
      expect(qm.getAllStates()).toHaveLength(2);
    });
  });
});
