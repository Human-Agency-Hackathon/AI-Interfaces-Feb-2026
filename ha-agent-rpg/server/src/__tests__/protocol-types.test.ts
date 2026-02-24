import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  MapNode, MapChangeMessage, RealmPresenceMessage,
  FogRevealMessage, FortUpdateMessage, FortViewMessage,
  FortClickMessage, FortExitMessage, AgentInfo,
  PlayerSubmitMessage, OracleDecisionMessage,
  HeroSummonedMessage, HeroDismissedMessage,
} from '../types.js';

describe('Hierarchical map protocol types', () => {
  it('MapNode has required shape', () => {
    const node: MapNode = {
      path: 'src',
      name: 'src',
      type: 'folder',
      children: [],
      doorPositions: {},
    };
    expectTypeOf(node).toMatchTypeOf<MapNode>();
  });

  it('MapChangeMessage has required shape', () => {
    const msg: MapChangeMessage = {
      type: 'map:change',
      path: 'src',
      map: { width: 10, height: 8, tile_size: 32, tiles: [] },
      objects: [],
      position: { x: 5, y: 5 },
      breadcrumb: { x: 5, y: 1 },
    };
    expectTypeOf(msg).toMatchTypeOf<MapChangeMessage>();
  });

  it('RealmPresenceMessage has required shape', () => {
    const msg: RealmPresenceMessage = {
      type: 'realm:presence',
      players: [{ id: 'a1', name: 'Oracle', path: 'src', depth: 1 }],
    };
    expectTypeOf(msg).toMatchTypeOf<RealmPresenceMessage>();
  });
});

describe('Fog-of-War message types', () => {
  it('FogRevealMessage has correct shape', () => {
    const msg: FogRevealMessage = {
      type: 'fog:reveal',
      tiles: [{ x: 5, y: 10 }, { x: 6, y: 10 }],
      agentId: 'agent_1',
    };
    expect(msg.type).toBe('fog:reveal');
    expect(msg.tiles).toHaveLength(2);
  });

  it('FortUpdateMessage has correct shape', () => {
    const msg: FortUpdateMessage = {
      type: 'fort:update',
      agentId: 'agent_1',
      stage: 3,
      position: { x: 60, y: 25 },
    };
    expect(msg.type).toBe('fort:update');
    expect(msg.stage).toBe(3);
  });

  it('FortViewMessage has correct shape', () => {
    const msg: FortViewMessage = {
      type: 'fort:view',
      agentId: 'agent_1',
      roomImage: 'room-forge',
      agentInfo: {} as AgentInfo,
    };
    expect(msg.type).toBe('fort:view');
  });

  it('FortClickMessage has correct shape', () => {
    const msg: FortClickMessage = {
      type: 'fort:click',
      agentId: 'agent_1',
    };
    expect(msg.type).toBe('fort:click');
  });

  it('FortExitMessage has correct shape', () => {
    const msg: FortExitMessage = {
      type: 'fort:exit',
    };
    expect(msg.type).toBe('fort:exit');
  });
});

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
