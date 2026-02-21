 Tile Format                                                                                                                                                             
  
  Tiles are stored as a 2D array of integers in TileMapData:                                                                                                              
  tiles[y][x] = number   // 20 wide × 15 tall grid                                                                                                                      
  tile_size = 32          // pixels                                                                                                                                     

  Current Tile Types

  ┌───────────────┬───────┬────────────────────────────────────────┬──────────┐
  │    Number     │ Name  │             Texture key(s)             │ Walkable │
  ├───────────────┼───────┼────────────────────────────────────────┼──────────┤
  │ 0             │ Grass │ tile-grass-0/1/2 (variant by position) │ Yes      │
  ├───────────────┼───────┼────────────────────────────────────────┼──────────┤
  │ 1             │ Wall  │ tile-wall                              │ No       │
  ├───────────────┼───────┼────────────────────────────────────────┼──────────┤
  │ 2             │ Water │ tile-water-0/1/2 (animated)            │ No       │
  ├───────────────┼───────┼────────────────────────────────────────┼──────────┤
  │ 3             │ Door  │ tile-door                              │ Yes      │
  ├───────────────┼───────┼────────────────────────────────────────┼──────────┤
  │ 4             │ Floor │ tile-floor                             │ Yes      │
  ├───────────────┼───────┼────────────────────────────────────────┼──────────┤
  │ anything else │ —     │ falls back to tile-grass-0             │ —        │
  └───────────────┴───────┴────────────────────────────────────────┴──────────┘

  Adding Your Own Tile

  Three places to touch:

  1. Generate the texture in client/src/scenes/BootScene.ts:create():
  private generateMyTile(): void {
    const g = this.add.graphics();
    // draw 32×32 pixels with g.fillStyle / g.fillRect
    g.generateTexture('tile-my-tile', 32, 32);
    g.destroy();
  }
  Then call this.generateMyTile() in create().

  2. Map the number → texture key in client/src/systems/MapRenderer.ts:getTileKey() (line 76):
  case 5: return 'tile-my-tile';

  3. Update walkability — two places:
  - server/src/WorldState.ts:isWalkable() (line 176) — server-side movement validation
  - client/src/scenes/GameScene.ts:~line 307 — client-side player movement check

  Tile Size

  All tiles are 32×32 pixels. Map objects (file, config, doc icons) are 16×16 — those are separate from terrain tiles.
