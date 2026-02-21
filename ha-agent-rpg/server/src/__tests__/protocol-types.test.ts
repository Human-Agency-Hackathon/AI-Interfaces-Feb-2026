import { describe, it, expectTypeOf } from 'vitest';
import type { MapNode, MapChangeMessage, RealmPresenceMessage } from '../types.js';

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
