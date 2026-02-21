import { DialogueLog } from '../panels/DialogueLog';
import type { DialogueData } from '../systems/DialogueSystem';
import type { AgentThoughtMessage, AgentActivityMessage } from '../types';

export class UIScene extends Phaser.Scene {
  private dialogueLog!: DialogueLog;
  private statusText!: Phaser.GameObjects.Text;
  /** Maps agent_id → { name, color } so thought/activity bubbles show display names */
  private agentInfo = new Map<string, { name: string; color: number }>();

  constructor() {
    super({ key: 'UIScene', active: true });
  }

  create(): void {
    this.dialogueLog = new DialogueLog('dialogue-log');

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

    // Track agent name/color so thought/activity bubbles can use display names
    window.addEventListener('agent-joined', ((e: CustomEvent) => {
      this.agentInfo.set(e.detail.agentId, { name: e.detail.name, color: e.detail.color });
    }) as EventListener);

    // Listen for events from GameScene
    this.events.on('show-dialogue', this.onShowDialogue, this);
    this.events.on('agent-thought', this.onAgentThought, this);
    this.events.on('agent-activity', this.onAgentActivity, this);
  }

  private onShowDialogue(data: DialogueData): void {
    this.dialogueLog.addEntry({
      agent_name: data.name,
      agent_color: data.color,
      text: data.text,
      type: 'speak',
      timestamp: Date.now(),
    });
  }

  private onAgentThought(data: AgentThoughtMessage): void {
    // Remove waiting text on first thought
    const waitingText = this.children.getByName('waitingText');
    if (waitingText) waitingText.destroy();

    const info = this.agentInfo.get(data.agent_id);
    const displayName = info?.name ?? data.agent_id;
    const displayColor = info?.color ?? 0x888888;

    this.statusText.setText(`Active: ${displayName}`);

    this.dialogueLog.addEntry({
      agent_name: displayName,
      agent_color: displayColor,
      text: data.text,
      type: 'think',
      timestamp: Date.now(),
    });
  }

  private onAgentActivity(data: AgentActivityMessage): void {
    // Remove waiting text on first activity
    const waitingText = this.children.getByName('waitingText');
    if (waitingText) waitingText.destroy();

    const info = this.agentInfo.get(data.agent_id);
    const displayName = info?.name ?? data.agent_id;
    this.statusText.setText(`Active: ${displayName}`);
    this.dialogueLog.addActivity(displayName, data.activity, data.tool_name);
  }
}
