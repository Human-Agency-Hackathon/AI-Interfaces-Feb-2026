import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CustomToolHandler } from '../CustomToolHandler.js';

// We test only the shape of the returned config, not the live MCP session
describe('createRpgMcpServer', () => {
  let mockToolHandler: CustomToolHandler;

  beforeEach(() => {
    mockToolHandler = {
      handleToolCall: vi.fn().mockResolvedValue({ result: { acknowledged: true } }),
    } as unknown as CustomToolHandler;
  });

  it('returns an MCP server config with type "sdk"', async () => {
    const { createRpgMcpServer } = await import('../RpgMcpServer.js');
    const config = createRpgMcpServer('oracle', mockToolHandler);
    expect(config.type).toBe('sdk');
    expect(config.name).toBe('rpg');
    expect(config.instance).toBeDefined();
  });

  it('creates unique instances per agent', async () => {
    const { createRpgMcpServer } = await import('../RpgMcpServer.js');
    const config1 = createRpgMcpServer('oracle', mockToolHandler);
    const config2 = createRpgMcpServer('engineer', mockToolHandler);
    expect(config1.instance).not.toBe(config2.instance);
  });
});

describe('createBrainstormMcpServer', () => {
  let mockToolHandler: CustomToolHandler;

  beforeEach(() => {
    mockToolHandler = {
      handleToolCall: vi.fn().mockResolvedValue({ result: { acknowledged: true } }),
    } as unknown as CustomToolHandler;
  });

  it('returns an MCP server config with type "sdk"', async () => {
    const { createBrainstormMcpServer } = await import('../RpgMcpServer.js');
    const config = createBrainstormMcpServer('ideator', mockToolHandler);
    expect(config.type).toBe('sdk');
    expect(config.name).toBe('brainstorm');
    expect(config.instance).toBeDefined();
  });

  it('creates unique instances per agent', async () => {
    const { createBrainstormMcpServer } = await import('../RpgMcpServer.js');
    const config1 = createBrainstormMcpServer('ideator', mockToolHandler);
    const config2 = createBrainstormMcpServer('synthesizer', mockToolHandler);
    expect(config1.instance).not.toBe(config2.instance);
  });

  it('has a different name than the RPG server', async () => {
    const { createRpgMcpServer, createBrainstormMcpServer } = await import('../RpgMcpServer.js');
    const rpg = createRpgMcpServer('agent1', mockToolHandler);
    const brainstorm = createBrainstormMcpServer('agent1', mockToolHandler);
    expect(rpg.name).toBe('rpg');
    expect(brainstorm.name).toBe('brainstorm');
  });
});
