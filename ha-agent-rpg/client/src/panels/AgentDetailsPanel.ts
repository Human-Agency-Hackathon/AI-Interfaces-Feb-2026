import type { AgentDetailsMessage } from '../types';

/**
 * Sidebar panel showing an agent's history: findings, insights, actions, thoughts.
 * Follows the same DOM overlay pattern as DialogueLog.
 */
export class AgentDetailsPanel {
  private container: HTMLElement;
  private currentAgentId: string | null = null;

  constructor(parentId: string) {
    this.container = document.getElementById(parentId)!;
  }

  /** Show panel with loading state for the given agent. */
  show(agentId: string, name: string, color: number): void {
    // Toggle off if clicking same agent
    if (this.currentAgentId === agentId && !this.container.classList.contains('agent-details-hidden')) {
      this.hide();
      return;
    }

    this.currentAgentId = agentId;
    this.container.classList.remove('agent-details-hidden');
    // Clear previous content using safe DOM method
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'agent-details-header';

    const nameDiv = document.createElement('div');
    const nameSpan = document.createElement('div');
    nameSpan.className = 'agent-details-name';
    nameSpan.style.color = '#' + color.toString(16).padStart(6, '0');
    nameSpan.textContent = name;
    nameDiv.appendChild(nameSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'agent-details-close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(nameDiv);
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Loading indicator
    const loading = document.createElement('div');
    loading.className = 'agent-details-loading';
    loading.textContent = 'Loading agent history...';
    this.container.appendChild(loading);
  }

  /** Hide panel and clear state. */
  hide(): void {
    this.container.classList.add('agent-details-hidden');
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.currentAgentId = null;
  }

  /** Populate the panel with agent details data. */
  populateData(details: AgentDetailsMessage): void {
    if (details.agent_id !== this.currentAgentId) return;

    // Remove loading indicator
    const loading = this.container.querySelector('.agent-details-loading');
    if (loading) loading.remove();

    // Update header with role info
    const header = this.container.querySelector('.agent-details-header');
    if (header) {
      const roleDiv = document.createElement('div');
      roleDiv.className = 'agent-details-role';
      roleDiv.textContent = details.info.role ?? details.info.agent_id;
      const nameDiv = header.firstElementChild;
      if (nameDiv) nameDiv.appendChild(roleDiv);
    }

    // Findings section
    this.addSection('Findings', details.findings.map(f => ({
      text: f.finding,
      timestamp: f.timestamp,
    })));

    // Insights section
    this.addSection('Insights', details.knowledge.insights.map(i => ({
      text: i,
    })));

    // Actions section (from transcript)
    this.addSection('Actions', details.transcript.actions.map(a => ({
      text: a.tool + ': ' + this.truncate(a.input, 120),
      timestamp: a.timestamp,
    })));

    // Thoughts section (from transcript)
    this.addSection('Thoughts', details.transcript.thoughts.map(t => ({
      text: this.truncate(t.text, 200),
      timestamp: t.timestamp,
    })));
  }

  /** Clear panel contents. */
  clear(): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.currentAgentId = null;
  }

  private addSection(
    title: string,
    items: Array<{ text: string; timestamp?: string }>,
  ): void {
    const section = document.createElement('div');
    section.className = 'agent-details-section';

    // Section header (built with safe DOM methods -- no innerHTML)
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'agent-details-section-header';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = title + ' (' + items.length + ')';
    sectionHeader.appendChild(titleSpan);

    const toggleSpan = document.createElement('span');
    toggleSpan.className = 'agent-details-section-toggle';
    toggleSpan.textContent = '\u25BC';
    sectionHeader.appendChild(toggleSpan);

    sectionHeader.addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });
    section.appendChild(sectionHeader);

    const body = document.createElement('div');
    body.className = 'agent-details-section-body';

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'agent-details-item';
      empty.style.color = '#555566';
      empty.textContent = 'None yet';
      body.appendChild(empty);
    } else {
      for (const item of items) {
        const div = document.createElement('div');
        div.className = 'agent-details-item';
        div.textContent = item.text;
        if (item.timestamp) {
          const time = document.createElement('span');
          time.className = 'agent-details-item-time';
          time.textContent = this.formatTime(item.timestamp);
          div.appendChild(time);
        }
        body.appendChild(div);
      }
    }

    section.appendChild(body);
    this.container.appendChild(section);
  }

  private formatTime(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  private truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '...';
  }
}
