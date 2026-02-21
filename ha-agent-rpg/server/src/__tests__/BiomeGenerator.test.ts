import { describe, it, expect } from 'vitest';
import { BiomeGenerator, BIOME_TYPES } from '../BiomeGenerator.js';

describe('BiomeGenerator', () => {
  describe('BIOME_TYPES', () => {
    it('has 6 biome types', () => {
      expect(BIOME_TYPES).toHaveLength(6);
    });
  });

  describe('assignBiome', () => {
    it('returns a biome type for a given name', () => {
      const biome = BiomeGenerator.assignBiome('agent_1');
      expect(BIOME_TYPES).toContain(biome);
    });

    it('returns consistent biome for same name', () => {
      const a = BiomeGenerator.assignBiome('agent_1');
      const b = BiomeGenerator.assignBiome('agent_1');
      expect(a).toBe(b);
    });
  });

  describe('generate', () => {
    const fortPositions = new Map<string, { x: number; y: number }>([
      ['oracle', { x: 60, y: 60 }],
      ['agent_1', { x: 60, y: 25 }],
      ['agent_2', { x: 95, y: 60 }],
    ]);

    it('returns a 120x120 tile grid', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      expect(result.tiles.length).toBe(120);
      expect(result.tiles[0].length).toBe(120);
    });

    it('returns a biomeMap of same dimensions', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      expect(result.biomeMap.length).toBe(120);
      expect(result.biomeMap[0].length).toBe(120);
    });

    it('all tile values are valid tile IDs (0-10)', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      for (let y = 0; y < 120; y++) {
        for (let x = 0; x < 120; x++) {
          expect(result.tiles[y][x]).toBeGreaterThanOrEqual(0);
          expect(result.tiles[y][x]).toBeLessThanOrEqual(10);
        }
      }
    });

    it('fort positions have floor tiles', () => {
      const result = BiomeGenerator.generate(120, 120, fortPositions);
      // Fort center tiles should be floor (4)
      expect(result.tiles[60][60]).toBe(4); // oracle fort center
    });
  });

  describe('getFortRadialPositions', () => {
    it('returns up to 8 positions around center', () => {
      const positions = BiomeGenerator.getFortRadialPositions(60, 60, 35, 4);
      expect(positions).toHaveLength(4);
    });

    it('positions are at correct radius from center', () => {
      const positions = BiomeGenerator.getFortRadialPositions(60, 60, 35, 1);
      const pos = positions[0];
      const dist = Math.sqrt((pos.x - 60) ** 2 + (pos.y - 60) ** 2);
      expect(dist).toBeCloseTo(35, 0);
    });

    it('caps at 8 positions', () => {
      const positions = BiomeGenerator.getFortRadialPositions(60, 60, 35, 12);
      expect(positions.length).toBeLessThanOrEqual(8);
    });
  });
});
