import { AgentDetailsPanel } from '../panels/AgentDetailsPanel';
import type { AgentThoughtMessage, AgentDetailsMessage } from '../types';

export class UIScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  /** Maps agent_id → { name, color } so other systems can look up display names */
  private agentInfo = new Map<string, { name: string; color: number }>();
  private agentDetailsPanel!: AgentDetailsPanel;

  constructor() {
    super({ key: 'UIScene', active: true });
  }

  create(): void {
    // Status indicator — top right
    this.statusText = this.add.text(620, 10, 'Agents starting...', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffff00',
      align: 'right',
    }).setOrigin(1, 0).setDepth(100);

    // "Waiting for agents..." message
    this.add.text(320, 240, 'Waiting for agents...', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#888888',
      align: 'center',
    }).setOrigin(0.5).setDepth(50).setName('waitingText');

    // Track agent name/color for display
    window.addEventListener('agent-joined', ((e: CustomEvent) => {
      this.agentInfo.set(e.detail.agentId, { name: e.detail.name, color: e.detail.color });
      // Remove waiting text once any agent has joined
      const wt = this.children.getByName('waitingText');
      if (wt) wt.destroy();
    }) as EventListener);

    // Listen for thought events from GameScene (just for status text update)
    this.events.on('agent-thought', this.onAgentThought, this);

    // Agent details panel
    this.agentDetailsPanel = new AgentDetailsPanel('agent-details-panel');

    this.events.on('show-agent-details', (data: { agent_id: string; name: string; color: number }) => {
      this.agentDetailsPanel.show(data.agent_id, data.name, data.color);
    });

    this.events.on('agent-details-loaded', (data: AgentDetailsMessage) => {
      this.agentDetailsPanel.populateData(data);
    });
  }

  private onAgentThought(data: AgentThoughtMessage): void {
    // Remove waiting text on first thought
    const waitingText = this.children.getByName('waitingText');
    if (waitingText) waitingText.destroy();

    const info = this.agentInfo.get(data.agent_id);
    const displayName = info?.name ?? data.agent_id;

    this.statusText.setText(`Active: ${displayName}`);
  }
}
