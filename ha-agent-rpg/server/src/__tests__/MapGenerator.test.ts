import { describe, it, expect } from 'vitest';
import { MapGenerator } from '../MapGenerator.js';
import { makeRepoData } from './helpers/fixtures.js';
import { STANDARD_BRAINSTORM } from '../ProcessTemplates.js';
import type { MapNode } from '../types.js';

describe('MapGenerator', () => {
  const generator = new MapGenerator();

  describe('generate()', () => {
    it('returns map, objects, and quests', () => {
      const result = generator.generate(makeRepoData());
      expect(result.map).toBeDefined();
      expect(result.objects).toBeDefined();
      expect(result.quests).toBeDefined();
    });

    it('generates a map with minimum dimensions (40x30)', () => {
      const { map } = generator.generate(
        makeRepoData({ tree: [{ path: 'a.ts', type: 'blob', size: 10 }] }),
      );
      expect(map.width).toBeGreaterThanOrEqual(40);
      expect(map.height).toBeGreaterThanOrEqual(30);
      expect(map.tile_size).toBe(32);
    });

    it('generates valid tile values (0-4 only)', () => {
      const { map } = generator.generate(makeRepoData());
      for (const row of map.tiles) {
        for (const tile of row) {
          expect(tile).toBeGreaterThanOrEqual(0);
          expect(tile).toBeLessThanOrEqual(4);
        }
      }
    });

    it('creates a root room with floor tiles', () => {
      const { map } = generator.generate(makeRepoData());
      const hasFloor = map.tiles.some((row) => row.some((t) => t === 4));
      expect(hasFloor).toBe(true);
    });

    it('creates rooms for top-level directories', () => {
      const repoData = makeRepoData({
        tree: [
          { path: 'src', type: 'tree' },
          { path: 'src/app.ts', type: 'blob', size: 100 },
          { path: 'lib', type: 'tree' },
          { path: 'lib/utils.ts', type: 'blob', size: 200 },
        ],
      });
      const { map } = generator.generate(repoData);
      const doorCount = map.tiles.flat().filter((t) => t === 3).length;
      expect(doorCount).toBeGreaterThanOrEqual(2);
    });

    it('places file objects inside rooms', () => {
      const { objects } = generator.generate(makeRepoData());
      const fileObjects = objects.filter(
        (o) => o.type === 'file' || o.type === 'config' || o.type === 'doc',
      );
      expect(fileObjects.length).toBeGreaterThan(0);
    });

    it('classifies .ts files as "file" type', () => {
      const { objects } = generator.generate(makeRepoData());
      const tsFile = objects.find((o) => o.label === 'index.ts');
      expect(tsFile?.type).toBe('file');
    });

    it('classifies package.json as "config" type', () => {
      const { objects } = generator.generate(makeRepoData());
      const pkg = objects.find((o) => o.label === 'package.json');
      expect(pkg?.type).toBe('config');
    });

    it('classifies README.md as "doc" type', () => {
      const { objects } = generator.generate(makeRepoData());
      const readme = objects.find((o) => o.label === 'README.md');
      expect(readme?.type).toBe('doc');
    });

    it('generates quests from issues', () => {
      const repoData = makeRepoData();
      const { quests } = generator.generate(repoData);
      expect(quests.length).toBe(repoData.issues.length);
      expect(quests[0].quest_id).toBe('issue_1');
      expect(quests[0].title).toBe('Fix index.ts crash');
    });

    it('assigns priority "high" to bug issues', () => {
      const { quests } = generator.generate(makeRepoData());
      const bugQuest = quests.find((q) => q.labels.includes('bug'));
      expect(bugQuest?.priority).toBe('high');
    });

    it('assigns priority "medium" to enhancement issues', () => {
      const { quests } = generator.generate(makeRepoData());
      const enhQuest = quests.find((q) => q.labels.includes('enhancement'));
      expect(enhQuest?.priority).toBe('medium');
    });

    it('assigns priority "low" to unlabeled issues', () => {
      const repoData = makeRepoData({
        issues: [{ number: 99, title: 'Something', body: '', labels: [], url: '' }],
      });
      const { quests } = generator.generate(repoData);
      expect(quests[0].priority).toBe('low');
    });

    it('creates quest markers in objects', () => {
      const { objects } = generator.generate(makeRepoData());
      const questMarkers = objects.filter((o) => o.type === 'quest_marker');
      expect(questMarkers.length).toBeGreaterThan(0);
    });

    it('guesses related files from issue text', () => {
      const { quests } = generator.generate(makeRepoData());
      const q = quests.find((q) => q.quest_id === 'issue_1');
      expect(q?.related_files.some((f) => f.includes('index.ts'))).toBe(true);
    });

    it('handles more than 8 top-level dirs without crashing', () => {
      const tree: any[] = [];
      for (let i = 0; i < 12; i++) {
        tree.push({ path: `dir${i}`, type: 'tree' });
        tree.push({ path: `dir${i}/file.ts`, type: 'blob', size: 10 });
      }
      const { map } = generator.generate(makeRepoData({ tree }));
      expect(map.tiles.length).toBeGreaterThan(0);
    });

    it('handles empty tree gracefully', () => {
      const result = generator.generate(makeRepoData({ tree: [], issues: [] }));
      expect(result.map.tiles.length).toBeGreaterThan(0);
      expect(result.quests.length).toBe(0);
    });
  });
});

describe('buildMapTree()', () => {
  const generator = new MapGenerator();

  it('returns a root node with path ""', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    expect(tree.path).toBe('');
    expect(tree.name).toBe('');
    expect(tree.type).toBe('folder');
  });

  it('makes top-level folders direct children of root', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const names = tree.children.map(c => c.name);
    expect(names).toContain('src');
    expect(names).toContain('docs');
  });

  it('nests files under their parent folder', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const src = tree.children.find(c => c.name === 'src')!;
    const fileNames = src.children.map(c => c.name);
    expect(fileNames).toContain('index.ts');
    expect(fileNames).toContain('utils.ts');
  });

  it('marks files with type "file"', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const src = tree.children.find(c => c.name === 'src')!;
    const indexTs = src.children.find(c => c.name === 'index.ts')!;
    expect(indexTs.type).toBe('file');
    expect(indexTs.children).toHaveLength(0);
  });

  it('places root-level files as children of root', () => {
    const tree = generator.buildMapTree(makeRepoData().tree);
    const rootFiles = tree.children.filter(c => c.type === 'file');
    const labels = rootFiles.map(c => c.name);
    expect(labels).toContain('package.json');
  });
});

describe('generateAgentMap()', () => {
  const generator = new MapGenerator();

  it('returns empty structures for empty agents array', () => {
    const result = generator.generateAgentMap([]);
    expect(result.map.width).toBe(60);
    expect(result.map.height).toBe(50);
    expect(result.objects).toHaveLength(0);
    expect(Object.keys(result.agentPositions)).toHaveLength(0);
  });

  it('places a single oracle room when one agent is given', () => {
    const result = generator.generateAgentMap([
      { agentId: 'oracle', name: 'Oracle', role: 'Lead' },
    ]);
    expect(result.agentPositions.oracle).toBeDefined();
    expect(result.objects.length).toBeGreaterThan(0);
    // Should have sign, 2 docs, 1 file = 4 objects
    expect(result.objects.length).toBe(4);
  });

  it('places oracle and sub-agent rooms', () => {
    const result = generator.generateAgentMap([
      { agentId: 'oracle', name: 'Oracle', role: 'Lead' },
      { agentId: 'eng_1', name: 'Engineer', role: 'Backend' },
      { agentId: 'eng_2', name: 'Tester', role: 'QA' },
    ]);
    expect(Object.keys(result.agentPositions)).toHaveLength(3);
    expect(result.agentPositions.oracle).toBeDefined();
    expect(result.agentPositions.eng_1).toBeDefined();
    expect(result.agentPositions.eng_2).toBeDefined();
  });

  it('generates valid tile values', () => {
    const result = generator.generateAgentMap([
      { agentId: 'oracle', name: 'Oracle', role: 'Lead' },
      { agentId: 'eng_1', name: 'Engineer', role: 'Backend' },
    ]);
    for (const row of result.map.tiles) {
      for (const tile of row) {
        expect(tile).toBeGreaterThanOrEqual(0);
        expect(tile).toBeLessThanOrEqual(4);
      }
    }
  });

  it('creates sign objects with agent info', () => {
    const result = generator.generateAgentMap([
      { agentId: 'oracle', name: 'Oracle', role: 'Lead' },
    ]);
    const sign = result.objects.find(o => o.type === 'sign');
    expect(sign).toBeDefined();
    expect(sign!.label).toContain('Oracle');
    expect(sign!.label).toContain('Lead');
  });

  it('creates corridor connections with door tiles', () => {
    const result = generator.generateAgentMap([
      { agentId: 'oracle', name: 'Oracle', role: 'Lead' },
      { agentId: 'eng_1', name: 'Engineer', role: 'Backend' },
    ]);
    // Should have door tiles (value 3) connecting rooms
    const doorCount = result.map.tiles.flat().filter(t => t === 3).length;
    expect(doorCount).toBeGreaterThanOrEqual(2);
  });

  it('handles maximum number of sub-agents (8)', () => {
    const agents = [{ agentId: 'oracle', name: 'Oracle', role: 'Lead' }];
    for (let i = 0; i < 8; i++) {
      agents.push({ agentId: `agent_${i}`, name: `Agent ${i}`, role: 'Worker' });
    }
    const result = generator.generateAgentMap(agents);
    expect(Object.keys(result.agentPositions)).toHaveLength(9);
  });
});

describe('generateProcessStageMap()', () => {
  const generator = new MapGenerator();

  it('returns blank map for invalid stage index', () => {
    const result = generator.generateProcessStageMap(STANDARD_BRAINSTORM, 99);
    expect(result.objects).toHaveLength(0);
    expect(Object.keys(result.agentPositions)).toHaveLength(0);
  });

  it('generates map for a valid stage', () => {
    const result = generator.generateProcessStageMap(STANDARD_BRAINSTORM, 0);
    expect(result.map.width).toBe(60);
    expect(result.map.height).toBe(50);
    expect(result.objects.length).toBeGreaterThan(0);
    expect(Object.keys(result.agentPositions).length).toBeGreaterThan(0);
  });

  it('places rooms for stage role agents', () => {
    // Stage 0 (ideation) has roles: facilitator, ideator
    const result = generator.generateProcessStageMap(STANDARD_BRAINSTORM, 0);
    expect(result.agentPositions.facilitator).toBeDefined();
    expect(result.agentPositions.ideator).toBeDefined();
  });

  it('adds a stage banner sign at the top', () => {
    const result = generator.generateProcessStageMap(STANDARD_BRAINSTORM, 0);
    const banner = result.objects.find(o => o.id.startsWith('stage_banner_'));
    expect(banner).toBeDefined();
    expect(banner!.label).toContain('Ideation');
    expect(banner!.metadata.stageId).toBe('ideation');
  });

  it('enriches sign labels with stage name', () => {
    const result = generator.generateProcessStageMap(STANDARD_BRAINSTORM, 0);
    const signs = result.objects.filter(o => o.type === 'sign' && !o.id.startsWith('stage_banner'));
    signs.forEach(sign => {
      expect(sign.label).toContain('Ideation');
    });
  });
});

describe('generateFolderMap()', () => {
  const generator = new MapGenerator();

  function makeNode(name: string, children: Partial<MapNode>[] = []): MapNode {
    return {
      path: name,
      name,
      type: 'folder',
      children: children.map(c => ({
        path: name ? `${name}/${c.name}` : (c.name ?? 'child'),
        name: c.name ?? 'child',
        type: c.type ?? 'folder',
        children: [],
        doorPositions: {},
        ...c,
      })),
      doorPositions: {},
    };
  }

  it('returns a map, objects, entryPosition, and doorPositions', () => {
    const node = makeNode('src', [{ name: 'utils', type: 'folder' }]);
    const result = generator.generateFolderMap(node, 1);
    expect(result.map).toBeDefined();
    expect(result.objects).toBeDefined();
    expect(result.entryPosition).toBeDefined();
    expect(result.doorPositions).toBeDefined();
  });

  it('generates a nav_back object at the entry position', () => {
    const node = makeNode('src');
    const { objects, entryPosition } = generator.generateFolderMap(node, 1);
    const back = objects.find(o => o.type === 'nav_back');
    expect(back).toBeDefined();
    expect(back!.x).toBe(entryPosition.x);
    expect(back!.y).toBe(entryPosition.y);
  });

  it('generates a nav_door object per subfolder child', () => {
    const node = makeNode('src', [
      { name: 'components', type: 'folder' },
      { name: 'utils', type: 'folder' },
    ]);
    const { objects } = generator.generateFolderMap(node, 1);
    const doors = objects.filter(o => o.type === 'nav_door');
    expect(doors).toHaveLength(2);
  });

  it('nav_door metadata includes the targetPath', () => {
    const node = makeNode('src', [{ name: 'components', type: 'folder' }]);
    const { objects } = generator.generateFolderMap(node, 1);
    const door = objects.find(o => o.type === 'nav_door')!;
    expect(door.metadata.targetPath).toBe('src/components');
  });

  it('generates a file object per file child', () => {
    const node = makeNode('src', [
      { name: 'index.ts', type: 'file' },
      { name: 'utils.ts', type: 'file' },
    ]);
    const { objects } = generator.generateFolderMap(node, 1);
    const files = objects.filter(o => o.type === 'file' || o.type === 'config' || o.type === 'doc');
    expect(files).toHaveLength(2);
  });

  it('scales map size with child count', () => {
    const small = makeNode('a', [{ name: 'b', type: 'folder' }]);
    const large = makeNode('a', Array.from({ length: 12 }, (_, i) => ({
      name: `child${i}`,
      type: 'folder' as const,
    })));
    const smallMap = generator.generateFolderMap(small, 1).map;
    const largeMap = generator.generateFolderMap(large, 1).map;
    expect(largeMap.width).toBeGreaterThan(smallMap.width);
  });

  it('produces consistent output for the same path (seeded)', () => {
    const node = makeNode('src', [{ name: 'utils', type: 'folder' }]);
    const r1 = generator.generateFolderMap(node, 1);
    const r2 = generator.generateFolderMap(node, 1);
    expect(r1.map.tiles).toEqual(r2.map.tiles);
    expect(r1.entryPosition).toEqual(r2.entryPosition);
  });

  it('entry is horizontally centred (not random)', () => {
    const node = makeNode('aaa', [{ name: 'x', type: 'folder' }]);
    const { map, entryPosition } = generator.generateFolderMap(node, 1);
    expect(entryPosition.x).toBe(Math.floor(map.width / 2));
    expect(entryPosition.y).toBe(1);
  });

  it('does not generate a nav_back object at depth 0 (root level)', () => {
    const node = makeNode('');
    const { objects } = generator.generateFolderMap(node, 0);
    const back = objects.find(o => o.type === 'nav_back');
    expect(back).toBeUndefined();
  });
});
