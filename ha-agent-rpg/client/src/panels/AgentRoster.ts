import type { AgentInfo } from '../types';

/**
 * Floating panel (top-left, over game canvas) listing all active agents.
 * Clicking an entry fires onAgentClick(agent) with fresh coordinates.
 * Follows the same DOM overlay pattern as AgentDetailsPanel and QuestLog.
 */
export class AgentRoster {
  private container: HTMLDivElement;
  private agents = new Map<string, AgentInfo>();
  private onAgentClick: (agent: AgentInfo) => void;

  constructor(onAgentClick: (agent: AgentInfo) => void) {
    this.onAgentClick = onAgentClick;
    this.container = document.createElement('div');
    this.container.id = 'agent-roster';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '8px',
      left: '8px',
      zIndex: '100',
      width: '160px',
      overflowY: 'auto',
      background: 'rgba(0,0,0,0.6)',
      fontFamily: 'monospace',
      fontSize: '12px',
      padding: '4px 0',
      pointerEvents: 'auto',
    });
    document.body.appendChild(this.container);
  }

  /** Add an agent to the roster. No-op if already present. */
  addAgent(agent: AgentInfo): void {
    if (this.agents.has(agent.agent_id)) return;
    this.agents.set(agent.agent_id, { ...agent });
    this.renderEntry(agent);
  }

  /** Remove an agent from the roster. No-op if not present. */
  removeAgent(agentId: string): void {
    if (!this.agents.has(agentId)) return;
    this.agents.delete(agentId);
    this.container.querySelector(`[data-agent-id="${agentId}"]`)?.remove();
  }

  /**
   * Sync roster to a full agent list.
   * Adds new agents, removes departed ones, updates x/y of existing ones.
   */
  syncAgents(agents: AgentInfo[]): void {
    const incoming = new Set(agents.map(a => a.agent_id));

    for (const agent of agents) {
      const stored = this.agents.get(agent.agent_id);
      if (stored) {
        stored.x = agent.x;
        stored.y = agent.y;
      } else {
        this.addAgent(agent);
      }
    }

    for (const agentId of [...this.agents.keys()]) {
      if (!incoming.has(agentId)) {
        this.removeAgent(agentId);
      }
    }
  }

  /** Remove the panel from the DOM. */
  destroy(): void {
    this.container.remove();
    this.agents.clear();
  }

  private renderEntry(agent: AgentInfo): void {
    const entry = document.createElement('div');
    entry.dataset.agentId = agent.agent_id;
    Object.assign(entry.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 8px',
      cursor: 'pointer',
      color: '#ffffff',
    });

    entry.addEventListener('mouseover', () => {
      entry.style.background = 'rgba(255,255,255,0.1)';
    });
    entry.addEventListener('mouseout', () => {
      entry.style.background = '';
    });

    const dot = document.createElement('span');
    Object.assign(dot.style, {
      display: 'inline-block',
      width: '12px',
      height: '12px',
      borderRadius: '50%',
      background: '#' + agent.color.toString(16).padStart(6, '0'),
      flexShrink: '0',
    });

    const nameSpan = document.createElement('span');
    nameSpan.textContent = agent.name;
    Object.assign(nameSpan.style, {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    entry.appendChild(dot);
    entry.appendChild(nameSpan);

    entry.addEventListener('click', () => {
      const current = this.agents.get(agent.agent_id);
      if (current) this.onAgentClick(current);
    });

    this.container.appendChild(entry);
  }
}
