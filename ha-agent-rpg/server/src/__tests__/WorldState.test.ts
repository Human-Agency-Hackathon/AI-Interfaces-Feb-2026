import { describe, it, expect, beforeEach } from 'vitest';
import { WorldState } from '../WorldState.js';
import { makeQuest } from './helpers/fixtures.js';
import type { MapNode } from '../types.js';

describe('WorldState', () => {
  let world: WorldState;

  beforeEach(() => {
    world = new WorldState();
  });

  describe('constructor', () => {
    it('creates a default 20x15 map', () => {
      expect(world.map.width).toBe(20);
      expect(world.map.height).toBe(15);
      expect(world.map.tile_size).toBe(32);
      expect(world.map.tiles.length).toBe(15);
      expect(world.map.tiles[0].length).toBe(20);
    });

    it('has walls on all borders', () => {
      for (let x = 0; x < 20; x++) {
        expect(world.map.tiles[0][x]).toBe(1);
        expect(world.map.tiles[14][x]).toBe(1);
      }
      for (let y = 0; y < 15; y++) {
        expect(world.map.tiles[y][0]).toBe(1);
        expect(world.map.tiles[y][19]).toBe(1);
      }
    });

    it('has water tiles in the pond area (10-12, 6-8)', () => {
      for (let y = 6; y <= 8; y++) {
        for (let x = 10; x <= 12; x++) {
          expect(world.map.tiles[y][x]).toBe(2);
        }
      }
    });

    it('has wall obstacles at known positions', () => {
      expect(world.map.tiles[4][5]).toBe(1);
      expect(world.map.tiles[5][5]).toBe(1);
      expect(world.map.tiles[10][14]).toBe(1);
      expect(world.map.tiles[10][15]).toBe(1);
    });

    it('starts with no agents', () => {
      expect(world.agents.size).toBe(0);
    });
  });

  describe('isWalkable', () => {
    it('returns true for grass (tile 0)', () => {
      expect(world.isWalkable(1, 1)).toBe(true);
    });

    it('returns false for walls (tile 1)', () => {
      expect(world.isWalkable(0, 0)).toBe(false);
    });

    it('returns false for water (tile 2)', () => {
      expect(world.isWalkable(10, 6)).toBe(false);
    });

    it('returns true for door (tile 3)', () => {
      world.map.tiles[2][2] = 3;
      expect(world.isWalkable(2, 2)).toBe(true);
    });

    it('returns true for floor (tile 4)', () => {
      world.map.tiles[2][2] = 4;
      expect(world.isWalkable(2, 2)).toBe(true);
    });

    it('returns false for out-of-bounds coordinates', () => {
      expect(world.isWalkable(-1, 0)).toBe(false);
      expect(world.isWalkable(0, -1)).toBe(false);
      expect(world.isWalkable(20, 0)).toBe(false);
      expect(world.isWalkable(0, 15)).toBe(false);
    });
  });

  describe('getTile', () => {
    it('returns wall (1) for out-of-bounds coordinates', () => {
      expect(world.getTile(-1, 0)).toBe(1);
      expect(world.getTile(100, 100)).toBe(1);
    });

    it('returns the correct tile for in-bounds coordinates', () => {
      expect(world.getTile(0, 0)).toBe(1);
      expect(world.getTile(1, 1)).toBe(0);
    });
  });

  describe('addAgent', () => {
    it('adds an agent with correct properties', () => {
      const agent = world.addAgent('a1', 'Oracle', 0x6a8aff, 'Oracle', '/');
      expect(agent.agent_id).toBe('a1');
      expect(agent.name).toBe('Oracle');
      expect(agent.color).toBe(0x6a8aff);
      expect(agent.role).toBe('Oracle');
      expect(agent.realm).toBe('/');
      expect(agent.status).toBe('starting');
      expect(agent.stats.codebase_fluency).toBe(0);
    });

    it('places agent on a walkable tile', () => {
      const agent = world.addAgent('a1', 'Test', 0, 'role', '/');
      expect(world.isWalkable(agent.x, agent.y)).toBe(true);
    });

    it('assigns unique positions to multiple agents', () => {
      const a1 = world.addAgent('a1', 'A1', 0, 'r', '/');
      const a2 = world.addAgent('a2', 'A2', 0, 'r', '/');
      expect(a1.x !== a2.x || a1.y !== a2.y).toBe(true);
    });

    it('stores agent in the agents map', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      expect(world.agents.has('a1')).toBe(true);
      expect(world.agents.size).toBe(1);
    });
  });

  describe('removeAgent', () => {
    it('removes an existing agent', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      world.removeAgent('a1');
      expect(world.agents.has('a1')).toBe(false);
    });

    it('does nothing for a non-existent agent', () => {
      world.removeAgent('nonexistent');
      expect(world.agents.size).toBe(0);
    });
  });

  describe('isOccupied', () => {
    it('returns false when no agents are present', () => {
      expect(world.isOccupied(1, 1)).toBe(false);
    });

    it('returns true when an agent is at the position', () => {
      const agent = world.addAgent('a1', 'Test', 0, 'r', '/');
      expect(world.isOccupied(agent.x, agent.y)).toBe(true);
    });
  });

  describe('applyMove', () => {
    it('moves an existing agent to the new position', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      const result = world.applyMove('a1', 5, 5);
      expect(result).toBe(true);
      expect(world.agents.get('a1')!.x).toBe(5);
      expect(world.agents.get('a1')!.y).toBe(5);
    });

    it('returns false for a non-existent agent', () => {
      expect(world.applyMove('nonexistent', 5, 5)).toBe(false);
    });
  });

  describe('updateAgentStatus', () => {
    it('updates the status of an existing agent', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      world.updateAgentStatus('a1', 'running');
      expect(world.agents.get('a1')!.status).toBe('running');
    });

    it('does nothing for a non-existent agent', () => {
      world.updateAgentStatus('nonexistent', 'running');
    });
  });

  describe('updateAgentActivity', () => {
    it('sets current_activity on the agent', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      world.updateAgentActivity('a1', 'Reading files');
      expect(world.agents.get('a1')!.current_activity).toBe('Reading files');
    });
  });

  describe('updateAgentStats', () => {
    it('merges realm_knowledge into existing stats', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      world.updateAgentStats('a1', { realm_knowledge: { 'src/': 5 } });
      expect(world.agents.get('a1')!.stats.realm_knowledge['src/']).toBe(5);
    });

    it('merges expertise into existing stats', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      world.updateAgentStats('a1', { expertise: { typescript: 3 } });
      expect(world.agents.get('a1')!.stats.expertise.typescript).toBe(3);
    });

    it('updates codebase_fluency', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      world.updateAgentStats('a1', { codebase_fluency: 42 });
      expect(world.agents.get('a1')!.stats.codebase_fluency).toBe(42);
    });
  });

  describe('setMap / setObjects / setQuests', () => {
    it('replaces the map', () => {
      const newMap = { width: 5, height: 5, tile_size: 32, tiles: [[0]] };
      world.setMap(newMap);
      expect(world.map).toBe(newMap);
    });

    it('stores and retrieves objects', () => {
      const objs = [{ id: 'f1', type: 'file' as const, x: 1, y: 1, label: 'test', metadata: {} }];
      world.setObjects(objs);
      expect(world.getObjects()).toBe(objs);
    });

    it('stores and retrieves quests', () => {
      const quests = [makeQuest()];
      world.setQuests(quests);
      expect(world.getQuests()).toBe(quests);
    });
  });

  describe('toJSON() and fromJSON()', () => {
    it('serializes and deserializes the world state', () => {
      const ws = new WorldState();
      ws.addAgent('a1', 'Oracle', 0x6a8aff, 'Oracle', '/');
      ws.setQuests([{ quest_id: 'q1', title: 'Test', body: '', labels: [], priority: 'low', source_url: '', related_files: [] }]);

      const json = ws.toJSON();
      const ws2 = WorldState.fromJSON(json);

      expect(ws2.agents.size).toBe(1);
      expect(ws2.agents.get('a1')?.name).toBe('Oracle');
      expect(ws2.getQuests()).toHaveLength(1);
      expect(ws2.map.width).toBe(ws.map.width);
    });

    it('round-trips objects correctly', () => {
      const ws = new WorldState();
      ws.setObjects([{ id: 'o1', type: 'file', x: 5, y: 5, label: 'test.ts', metadata: {} }]);

      const ws2 = WorldState.fromJSON(ws.toJSON());
      expect(ws2.getObjects()).toHaveLength(1);
      expect(ws2.getObjects()[0].label).toBe('test.ts');
    });
  });

  describe('getSnapshot', () => {
    it('returns a WorldStateMessage with incrementing tick', () => {
      const snap1 = world.getSnapshot();
      expect(snap1.type).toBe('world:state');
      expect(snap1.tick).toBe(1);

      const snap2 = world.getSnapshot();
      expect(snap2.tick).toBe(2);
    });

    it('includes all agents as an array', () => {
      world.addAgent('a1', 'Test', 0, 'r', '/');
      const snap = world.getSnapshot();
      expect(snap.agents.length).toBe(1);
      expect(snap.agents[0].agent_id).toBe('a1');
    });

    it('includes map, objects, and quests', () => {
      const snap = world.getSnapshot();
      expect(snap.map).toBeDefined();
      expect(snap.objects).toBeDefined();
      expect(snap.quests).toBeDefined();
    });
  });
});

describe('Process State', () => {
  let world: WorldState;

  beforeEach(() => {
    world = new WorldState();
  });

  function makeProcessState() {
    return {
      processId: 'test_process',
      problem: 'How to build an agent?',
      currentStageIndex: 0,
      status: 'running' as const,
      collectedArtifacts: {},
      startedAt: new Date().toISOString(),
    };
  }

  describe('setProcessState / getProcessState', () => {
    it('starts with null process state', () => {
      expect(world.getProcessState()).toBeNull();
    });

    it('sets and returns process state', () => {
      const state = makeProcessState();
      world.setProcessState(state);
      expect(world.getProcessState()).toBe(state);
    });
  });

  describe('advanceStage', () => {
    it('increments currentStageIndex', () => {
      world.setProcessState(makeProcessState());
      world.advanceStage('stage_0', {});
      expect(world.getProcessState()!.currentStageIndex).toBe(1);
    });

    it('records artifacts for the completed stage', () => {
      world.setProcessState(makeProcessState());
      world.advanceStage('stage_0', { idea_list: 'ideas here' });
      expect(world.getProcessState()!.collectedArtifacts['stage_0']).toEqual({
        idea_list: 'ideas here',
      });
    });

    it('does nothing when processState is null', () => {
      // Should not throw
      world.advanceStage('stage_0', {});
      expect(world.getProcessState()).toBeNull();
    });

    it('handles multiple stage advances', () => {
      world.setProcessState(makeProcessState());
      world.advanceStage('stage_0', { doc: 'first' });
      world.advanceStage('stage_1', { doc: 'second' });
      expect(world.getProcessState()!.currentStageIndex).toBe(2);
      expect(Object.keys(world.getProcessState()!.collectedArtifacts)).toHaveLength(2);
    });
  });

  describe('completeProcess', () => {
    it('sets status to completed', () => {
      world.setProcessState(makeProcessState());
      world.completeProcess('final_stage', {});
      expect(world.getProcessState()!.status).toBe('completed');
    });

    it('records completedAt timestamp', () => {
      world.setProcessState(makeProcessState());
      world.completeProcess('final_stage', {});
      expect(world.getProcessState()!.completedAt).toBeTruthy();
    });

    it('records final stage artifacts', () => {
      world.setProcessState(makeProcessState());
      world.completeProcess('final_stage', { output: 'final result' });
      expect(world.getProcessState()!.collectedArtifacts['final_stage']).toEqual({
        output: 'final result',
      });
    });

    it('does nothing when processState is null', () => {
      world.completeProcess('stage', {});
      expect(world.getProcessState()).toBeNull();
    });
  });

  describe('setArtifact', () => {
    it('stores a single artifact for a stage', () => {
      world.setProcessState(makeProcessState());
      world.setArtifact('ideation', 'idea_1', 'Build a chatbot');
      expect(world.getProcessState()!.collectedArtifacts['ideation']['idea_1']).toBe(
        'Build a chatbot',
      );
    });

    it('creates the stage artifact map if it does not exist', () => {
      world.setProcessState(makeProcessState());
      world.setArtifact('new_stage', 'art_1', 'content');
      expect(world.getProcessState()!.collectedArtifacts['new_stage']).toBeDefined();
    });

    it('appends to existing stage artifacts', () => {
      world.setProcessState(makeProcessState());
      world.setArtifact('ideation', 'idea_1', 'First idea');
      world.setArtifact('ideation', 'idea_2', 'Second idea');
      expect(Object.keys(world.getProcessState()!.collectedArtifacts['ideation'])).toHaveLength(2);
    });

    it('does nothing when processState is null', () => {
      world.setArtifact('stage', 'art', 'content');
      expect(world.getProcessState()).toBeNull();
    });
  });

  describe('toJSON/fromJSON round-trip', () => {
    it('round-trips process state', () => {
      world.setProcessState(makeProcessState());
      world.setArtifact('stage_0', 'doc', 'some content');
      world.advanceStage('stage_0', { doc: 'some content' });

      const ws2 = WorldState.fromJSON(world.toJSON());
      const ps = ws2.getProcessState();
      expect(ps).not.toBeNull();
      expect(ps!.processId).toBe('test_process');
      expect(ps!.currentStageIndex).toBe(1);
      expect(ps!.collectedArtifacts['stage_0']).toEqual({ doc: 'some content' });
    });

    it('round-trips null process state', () => {
      const ws2 = WorldState.fromJSON(world.toJSON());
      expect(ws2.getProcessState()).toBeNull();
    });

    it('round-trips completed process state', () => {
      world.setProcessState(makeProcessState());
      world.completeProcess('final', { result: 'done' });

      const ws2 = WorldState.fromJSON(world.toJSON());
      expect(ws2.getProcessState()!.status).toBe('completed');
      expect(ws2.getProcessState()!.completedAt).toBeTruthy();
    });
  });
});

function makeMapNode(path: string, children: MapNode[] = []): MapNode {
  return {
    path,
    name: path.split('/').pop() ?? path,
    type: 'folder',
    children,
    doorPositions: {},
  };
}

describe('MapTree', () => {
  it('starts with mapTree as null', () => {
    const ws = new WorldState();
    expect(ws.mapTree).toBeNull();
  });

  it('setMapTree() stores the root node', () => {
    const ws = new WorldState();
    const root = makeMapNode('');
    ws.setMapTree(root);
    expect(ws.mapTree).toBe(root);
  });

  it('getMapNode() returns the root for empty path', () => {
    const ws = new WorldState();
    ws.setMapTree(makeMapNode('', [makeMapNode('src')]));
    expect(ws.getMapNode('')).toBe(ws.mapTree);
  });

  it('getMapNode() finds a nested node by path', () => {
    const utils = makeMapNode('src/utils');
    const src = makeMapNode('src', [utils]);
    const ws = new WorldState();
    ws.setMapTree(makeMapNode('', [src]));
    expect(ws.getMapNode('src/utils')).toBe(utils);
  });

  it('getMapNode() returns null for unknown path', () => {
    const ws = new WorldState();
    ws.setMapTree(makeMapNode(''));
    expect(ws.getMapNode('nonexistent')).toBeNull();
  });

  it('getMapNode() returns null when no mapTree is set', () => {
    const ws = new WorldState();
    expect(ws.getMapNode('src')).toBeNull();
  });

  it('toJSON()/fromJSON() round-trips the mapTree', () => {
    const ws = new WorldState();
    ws.setMapTree(makeMapNode('', [makeMapNode('src')]));
    const ws2 = WorldState.fromJSON(ws.toJSON());
    expect(ws2.mapTree).not.toBeNull();
    expect(ws2.mapTree!.children[0].name).toBe('src');
  });

  it('toJSON()/fromJSON() with null mapTree stays null', () => {
    const ws = new WorldState();
    const ws2 = WorldState.fromJSON(ws.toJSON());
    expect(ws2.mapTree).toBeNull();
  });
});
