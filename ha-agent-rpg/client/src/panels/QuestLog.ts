import type { Quest } from '../types';

export class QuestLog {
  private container: HTMLElement;
  private quests: Quest[] = [];

  constructor(parentId: string) {
    this.container = document.getElementById(parentId)!;
  }

  setQuests(quests: Quest[]): void {
    this.quests = quests;
    this.render();
  }

  updateQuestStatus(questId: string, status: string, _agentId?: string): void {
    // Update the display for a specific quest
    const el = this.container.querySelector(`[data-quest="${questId}"]`);
    if (el) {
      const badge = el.querySelector('.quest-status');
      if (badge) {
        badge.textContent = status;
        badge.className = `quest-status quest-${status}`;
      }
    }
  }

  private render(): void {
    // Clear existing content
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    for (const q of this.quests) {
      const item = document.createElement('div');
      item.className = 'quest-item';
      item.dataset.quest = q.quest_id;

      const priority = document.createElement('div');
      priority.className = `quest-priority quest-priority-${q.priority}`;
      priority.textContent = '\u25CF';  // filled circle

      const info = document.createElement('div');
      info.className = 'quest-info';

      const title = document.createElement('div');
      title.className = 'quest-title';
      title.textContent = q.title;

      const status = document.createElement('div');
      status.className = 'quest-status quest-open';
      status.textContent = 'open';

      info.appendChild(title);
      info.appendChild(status);
      item.appendChild(priority);
      item.appendChild(info);
      this.container.appendChild(item);
    }
  }
}
