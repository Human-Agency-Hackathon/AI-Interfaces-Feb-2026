import type { Quest, MapObject, TileMapData } from '../../types.js';
import type { RepoData } from '../../RepoAnalyzer.js';

export function makeQuest(overrides: Partial<Quest> = {}): Quest {
  return {
    quest_id: 'issue_1',
    title: 'Fix login bug',
    body: 'Login page crashes on mobile',
    labels: ['bug'],
    priority: 'high',
    source_url: 'https://github.com/test/repo/issues/1',
    related_files: ['src/auth/login.ts'],
    ...overrides,
  };
}

export function makeMapObject(overrides: Partial<MapObject> = {}): MapObject {
  return {
    id: 'file_src_index_ts',
    type: 'file',
    x: 5,
    y: 5,
    label: 'index.ts',
    metadata: { fullPath: 'src/index.ts', size: 1024 },
    ...overrides,
  };
}

export function makeRepoData(overrides: Partial<RepoData> = {}): RepoData {
  return {
    owner: 'testowner',
    repo: 'testrepo',
    tree: [
      { path: 'src', type: 'tree' },
      { path: 'src/index.ts', type: 'blob', size: 500 },
      { path: 'src/utils.ts', type: 'blob', size: 300 },
      { path: 'docs', type: 'tree' },
      { path: 'docs/README.md', type: 'blob', size: 200 },
      { path: 'package.json', type: 'blob', size: 100 },
    ],
    issues: [
      {
        number: 1,
        title: 'Fix index.ts crash',
        body: 'The index.ts file crashes on startup',
        labels: ['bug'],
        url: 'https://github.com/testowner/testrepo/issues/1',
      },
      {
        number: 2,
        title: 'Add feature',
        body: 'Add a new feature to utils.ts',
        labels: ['enhancement'],
        url: 'https://github.com/testowner/testrepo/issues/2',
      },
    ],
    languages: { TypeScript: 800, Markdown: 200 },
    totalFiles: 4,
    defaultBranch: 'main',
    ...overrides,
  };
}

export function makeTileMap(width = 10, height = 8): TileMapData {
  const tiles: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        row.push(1); // wall border
      } else {
        row.push(0); // grass
      }
    }
    tiles.push(row);
  }
  return { width, height, tile_size: 32, tiles };
}
