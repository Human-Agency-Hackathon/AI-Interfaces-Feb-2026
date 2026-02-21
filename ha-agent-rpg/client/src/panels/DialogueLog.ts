export interface DialogueEntry {
  agent_name: string;
  agent_color: number;
  text: string;
  type: 'speak' | 'think';
  timestamp: number;
}

const TRUNCATE_LENGTH = 300;
const MAX_ENTRIES = 100;

/** Tool name to emoji icon mapping for activity indicators */
const TOOL_ICONS: Record<string, string> = {
  Read: '\uD83D\uDCD6',     // open book
  Edit: '\u270F\uFE0F',     // pencil
  Write: '\u270F\uFE0F',    // pencil
  Bash: '\u26A1',            // lightning
  Grep: '\uD83D\uDD0D',     // magnifying glass
  Glob: '\uD83D\uDD0D',     // magnifying glass
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function hexColor(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

export class DialogueLog {
  private container: HTMLElement;
  private entryCount = 0;

  constructor(parentId: string) {
    this.container = document.getElementById(parentId)!;

    // Listen for PromptBar events
    window.addEventListener('prompt-player-message', ((e: CustomEvent) => {
      this.addPlayerMessage(e.detail.text);
    }) as EventListener);

    window.addEventListener('prompt-system-message', ((e: CustomEvent) => {
      this.addSystemMessage(e.detail.text);
    }) as EventListener);

    window.addEventListener('spectator-command', ((e: CustomEvent) => {
      this.addSpectatorCommand(e.detail.name, e.detail.color, e.detail.text, e.detail.isOwn ?? false);
    }) as EventListener);

    window.addEventListener('findings-posted', ((e: CustomEvent) => {
      this.addFinding(e.detail.agent_name, e.detail.finding);
    }) as EventListener);

    window.addEventListener('stage-announcement', ((e: CustomEvent) => {
      this.addStageAnnouncement(e.detail.text);
    }) as EventListener);
  }

  /** Agent speech or thought — called from UIScene */
  addEntry(entry: DialogueEntry): void {
    this.pruneOldEntries();

    const bubbleClass = entry.type === 'think' ? 'chat-bubble-thought' : 'chat-bubble-agent';
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${bubbleClass}`;

    // Header with name + timestamp
    const header = document.createElement('div');
    header.className = 'chat-bubble-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-agent-name';
    nameEl.style.color = hexColor(entry.agent_color);
    nameEl.textContent = entry.agent_name;

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-timestamp';
    timeEl.textContent = formatTime(entry.timestamp);

    header.appendChild(nameEl);
    header.appendChild(timeEl);
    bubble.appendChild(header);

    // Body with optional truncation
    this.appendBodyWithTruncation(bubble, entry.text);

    this.container.appendChild(bubble);
    this.entryCount++;
    this.scrollToBottom();
  }

  /** Player's own message — right-aligned bubble */
  addPlayerMessage(text: string): void {
    this.pruneOldEntries();

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-player';

    // Header with timestamp only
    const header = document.createElement('div');
    header.className = 'chat-bubble-header';
    header.style.justifyContent = 'flex-end';

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-timestamp';
    timeEl.textContent = formatTime(Date.now());

    header.appendChild(timeEl);
    bubble.appendChild(header);

    // Body
    this.appendBodyWithTruncation(bubble, text);

    this.container.appendChild(bubble);
    this.entryCount++;
    this.scrollToBottom();
  }

  /** Spectator command bubble — right-aligned for self (isOwn), left for others. */
  addSpectatorCommand(name: string, color: number, text: string, isOwn: boolean): void {
    this.pruneOldEntries();

    const bubble = document.createElement('div');
    bubble.className = isOwn
      ? 'chat-bubble chat-bubble-player'
      : 'chat-bubble chat-bubble-spectator';

    const header = document.createElement('div');
    header.className = 'chat-bubble-header';
    if (isOwn) {
      header.style.justifyContent = 'flex-end';
    }

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-agent-name';
    nameEl.style.color = hexColor(color);
    nameEl.textContent = isOwn ? '[You]' : `[${name}]`;

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-timestamp';
    timeEl.textContent = formatTime(Date.now());

    header.appendChild(nameEl);
    header.appendChild(timeEl);
    bubble.appendChild(header);

    this.appendBodyWithTruncation(bubble, text);

    this.container.appendChild(bubble);
    this.entryCount++;
    this.scrollToBottom();
  }

  /** Centered system/info message */
  addSystemMessage(text: string): void {
    this.pruneOldEntries();

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-system';

    const body = document.createElement('div');
    body.className = 'chat-bubble-body';
    body.textContent = text;
    body.style.whiteSpace = 'pre-wrap';

    bubble.appendChild(body);
    this.container.appendChild(bubble);
    this.entryCount++;
    this.scrollToBottom();
  }

  /** Findings posted by an agent during brainstorm */
  addFinding(agentName: string, finding: string): void {
    this.pruneOldEntries();

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-finding';

    const header = document.createElement('div');
    header.className = 'chat-bubble-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'chat-agent-name';
    nameEl.textContent = agentName;

    const timeEl = document.createElement('span');
    timeEl.className = 'chat-timestamp';
    timeEl.textContent = formatTime(Date.now());

    header.appendChild(nameEl);
    header.appendChild(timeEl);
    bubble.appendChild(header);

    this.appendBodyWithTruncation(bubble, finding);

    this.container.appendChild(bubble);
    this.entryCount++;
    this.scrollToBottom();
  }

  /** Stage transition announcement */
  addStageAnnouncement(text: string): void {
    this.pruneOldEntries();

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-stage-announce';
    bubble.textContent = text;

    this.container.appendChild(bubble);
    this.entryCount++;
    this.scrollToBottom();
  }

  /** Compact activity indicator (e.g. "Reading src/api/users.ts") */
  addActivity(agentId: string, activity: string, toolName?: string): void {
    this.pruneOldEntries();

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble chat-bubble-activity';

    const iconEl = document.createElement('span');
    iconEl.className = 'activity-icon';
    iconEl.textContent = (toolName && TOOL_ICONS[toolName]) || '\u2699'; // gear fallback

    const textEl = document.createElement('span');
    textEl.textContent = `${agentId}: ${activity}`;

    bubble.appendChild(iconEl);
    bubble.appendChild(textEl);
    this.container.appendChild(bubble);
    this.entryCount++;
    this.scrollToBottom();
  }

  /** Clear all entries */
  clear(): void {
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }
    this.entryCount = 0;
  }

  // ── Private helpers ──

  private appendBodyWithTruncation(parent: HTMLElement, text: string): void {
    const body = document.createElement('div');
    body.className = 'chat-bubble-body';

    if (text.length > TRUNCATE_LENGTH) {
      // Find word boundary near truncation point
      let cutoff = text.lastIndexOf(' ', TRUNCATE_LENGTH);
      if (cutoff < TRUNCATE_LENGTH * 0.5) cutoff = TRUNCATE_LENGTH;
      const truncated = text.slice(0, cutoff) + '\u2026';

      body.textContent = truncated;
      body.classList.add('truncated');

      const showMore = document.createElement('button');
      showMore.className = 'chat-show-more';
      showMore.textContent = 'Show More';

      let expanded = false;
      showMore.addEventListener('click', () => {
        expanded = !expanded;
        if (expanded) {
          body.textContent = text;
          body.classList.remove('truncated');
          showMore.textContent = 'Show Less';
        } else {
          body.textContent = truncated;
          body.classList.add('truncated');
          showMore.textContent = 'Show More';
        }
      });

      parent.appendChild(body);
      parent.appendChild(showMore);
    } else {
      body.textContent = text;
      parent.appendChild(body);
    }
  }

  private pruneOldEntries(): void {
    while (this.entryCount >= MAX_ENTRIES && this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
      this.entryCount--;
    }
  }

  private scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }
}
