import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRoster } from '../../panels/AgentRoster';
import type { AgentInfo } from '../../types';

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    agent_id: 'test_agent',
    name: 'Test Agent',
    color: 0xff0000,
    x: 5,
    y: 5,
    role: 'Tester',
    realm: 'src/',
    stats: {
      realm_knowledge: {},
      expertise: {},
      codebase_fluency: 0,
      collaboration_score: 0,
    },
    status: 'running',
    ...overrides,
  };
}

describe('AgentRoster', () => {
  let onAgentClick: ReturnType<typeof vi.fn>;
  let roster: AgentRoster;

  beforeEach(() => {
    onAgentClick = vi.fn();
    roster = new AgentRoster(onAgentClick);
  });

  afterEach(() => {
    roster.destroy();
  });

  it('creates a container fixed at top-left with z-index 100', () => {
    const el = document.getElementById('agent-roster');
    expect(el).toBeTruthy();
    expect(el!.style.position).toBe('fixed');
    expect(el!.style.top).toBe('8px');
    expect(el!.style.left).toBe('8px');
    expect(el!.style.zIndex).toBe('100');
  });

  it('addAgent renders an entry with agent name', () => {
    roster.addAgent(makeAgent());
    const entry = document.querySelector('[data-agent-id="test_agent"]');
    expect(entry).toBeTruthy();
    expect(entry!.textContent).toContain('Test Agent');
  });

  it('addAgent does not create a duplicate entry if called twice', () => {
    roster.addAgent(makeAgent());
    roster.addAgent(makeAgent());
    const entries = document.querySelectorAll('[data-agent-id="test_agent"]');
    expect(entries.length).toBe(1);
  });

  it('removeAgent removes the entry from the DOM', () => {
    roster.addAgent(makeAgent());
    roster.removeAgent('test_agent');
    expect(document.querySelector('[data-agent-id="test_agent"]')).toBeNull();
  });

  it('removeAgent is a no-op for unknown agent ids', () => {
    expect(() => roster.removeAgent('nonexistent')).not.toThrow();
  });

  it('clicking an entry calls onAgentClick with the current AgentInfo', () => {
    const agent = makeAgent();
    roster.addAgent(agent);
    const entry = document.querySelector<HTMLElement>('[data-agent-id="test_agent"]')!;
    entry.click();
    expect(onAgentClick).toHaveBeenCalledTimes(1);
    expect(onAgentClick).toHaveBeenCalledWith(agent);
  });

  it('syncAgents adds new agents not yet in the roster', () => {
    const a2 = makeAgent({ agent_id: 'a2', name: 'Agent Two' });
    roster.syncAgents([a2]);
    expect(document.querySelector('[data-agent-id="a2"]')).toBeTruthy();
  });

  it('syncAgents removes agents that are no longer in the list', () => {
    roster.addAgent(makeAgent({ agent_id: 'a1', name: 'A1' }));
    roster.addAgent(makeAgent({ agent_id: 'a2', name: 'A2' }));
    roster.syncAgents([makeAgent({ agent_id: 'a2', name: 'A2' })]);
    expect(document.querySelector('[data-agent-id="a1"]')).toBeNull();
    expect(document.querySelector('[data-agent-id="a2"]')).toBeTruthy();
  });

  it('syncAgents updates x/y so click callback uses fresh coords', () => {
    roster.addAgent(makeAgent({ x: 1, y: 1 }));
    roster.syncAgents([makeAgent({ x: 10, y: 20 })]);
    document.querySelector<HTMLElement>('[data-agent-id="test_agent"]')!.click();
    expect(onAgentClick).toHaveBeenCalledWith(expect.objectContaining({ x: 10, y: 20 }));
  });

  it('destroy removes the container from the DOM', () => {
    roster.destroy();
    expect(document.getElementById('agent-roster')).toBeNull();
    // Prevent afterEach double-destroy
    roster = new AgentRoster(onAgentClick);
  });
});
