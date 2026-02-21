import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  MapNode, MapChangeMessage, RealmPresenceMessage,
  FogRevealMessage, FortUpdateMessage, FortViewMessage,
  FortClickMessage, FortExitMessage, AgentInfo,
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
