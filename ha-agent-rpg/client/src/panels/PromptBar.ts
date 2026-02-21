import type { WebSocketClient } from '../network/WebSocketClient';

export type AutonomyMode = 'manual' | 'supervised' | 'autonomous';

export interface SlashCommand {
  name: string;
  icon: string;
  description: string;
  /** If true, the command text is forwarded to an agent as player:command */
  forward?: boolean;
  handler: (args: string) => void;
}

export interface PromptBarOptions {
  onClearLog?: () => void;
  onToggleSettings?: () => void;
  onShowQuests?: () => void;
  onPlayerMessage?: (text: string) => void;
}

export class PromptBar {
  private container: HTMLElement;
  private wrapper!: HTMLElement;
  private textarea!: HTMLTextAreaElement;
  private commandMenu!: HTMLElement;
  private modeIndicator!: HTMLElement;
  private sendBtn!: HTMLButtonElement;
  private focusBadge!: HTMLElement;
  private focusNameEl!: HTMLElement;

  private ws: WebSocketClient;
  private commands: SlashCommand[];
  private currentMode: AutonomyMode = 'supervised';
  private focusedAgent: string | null = null;
  private selectedCommandIndex = 0;
  private filteredCommands: SlashCommand[] = [];
  private options: PromptBarOptions;

  constructor(parentId: string, ws: WebSocketClient, options: PromptBarOptions = {}) {
    this.container = document.getElementById(parentId)!;
    this.ws = ws;
    this.options = options;
    this.commands = this.initCommands();
    this.buildDOM();
  }

  // ── Public API ──

  focus(): void {
    this.textarea.focus();
  }

  setMode(mode: AutonomyMode): void {
    this.currentMode = mode;
    this.updateModeDisplay();
    this.ws.send({
      type: 'player:update-settings',
      settings: { autonomy_mode: this.currentMode },
    });
  }

  getMode(): AutonomyMode {
    return this.currentMode;
  }

  setFocusedAgent(agentId: string | null): void {
    this.focusedAgent = agentId;
    if (agentId) {
      this.focusNameEl.textContent = `@${agentId}`;
      this.focusBadge.style.display = 'flex';
    } else {
      this.focusBadge.style.display = 'none';
    }
  }

  destroy(): void {
    this.wrapper.remove();
  }

  // ── Command Definitions ──

  private initCommands(): SlashCommand[] {
    return [
      {
        name: 'summon',
        icon: '\u2728',
        description: 'Request a new specialist agent',
        handler: (args) => {
          this.ws.send({
            type: 'player:command',
            text: `Summon a new agent: ${args || 'general specialist'}`,
          });
        },
      },
      {
        name: 'dismiss',
        icon: '\u274C',
        description: 'Remove an agent (e.g. /dismiss engineer)',
        handler: (args) => {
          if (args) {
            this.ws.send({ type: 'player:dismiss-agent', agent_id: args.trim() });
          }
        },
      },
      {
        name: 'rename',
        icon: '\u270F',
        description: 'Rename an agent (e.g. /rename oracle Merlin)',
        handler: () => {
          this.addSystemMessage('Agent renaming coming soon.');
        },
      },
      {
        name: 'quest',
        icon: '\u2757',
        description: 'Show the quest log',
        handler: () => {
          this.options.onShowQuests?.();
        },
      },
      {
        name: 'focus',
        icon: '\uD83C\uDFAF',
        description: 'Direct commands to a specific agent',
        handler: (args) => {
          const agent = args.trim().replace(/^@/, '');
          this.setFocusedAgent(agent || null);
          if (agent) {
            this.addSystemMessage(`Focusing commands on @${agent}`);
          } else {
            this.addSystemMessage('Focus cleared. Commands go to default agent.');
          }
        },
      },
      {
        name: 'settings',
        icon: '\u2699',
        description: 'Toggle settings panel',
        handler: () => {
          this.options.onToggleSettings?.();
        },
      },
      {
        name: 'config',
        icon: '\uD83D\uDD27',
        description: 'Open display configuration',
        handler: () => {
          this.addSystemMessage('Configuration panel coming soon.');
        },
      },
      {
        name: 'clear',
        icon: '\uD83E\uDDF9',
        description: 'Clear chat log',
        handler: () => {
          this.options.onClearLog?.();
        },
      },
      {
        name: 'mode',
        icon: '\uD83D\uDD04',
        description: 'Switch autonomy mode',
        handler: (args) => {
          const mode = args.trim() as AutonomyMode;
          if (['manual', 'supervised', 'autonomous'].includes(mode)) {
            this.setMode(mode);
            this.addSystemMessage(`Mode set to ${mode}`);
          } else {
            this.cycleMode();
          }
        },
      },
      {
        name: 'quit',
        icon: '\uD83D\uDEAA',
        description: 'Return to realm selection',
        handler: () => {
          window.dispatchEvent(new CustomEvent('prompt-quit-game'));
        },
      },
      {
        name: 'help',
        icon: '\u2753',
        description: 'Show available commands',
        handler: () => {
          const helpLines = this.commands
            .map((c) => `  /${c.name} \u2014 ${c.description}`)
            .join('\n');
          this.addSystemMessage('Available commands:\n' + helpLines);
        },
      },
      // Workflow commands (forwarded to agents)
      {
        name: 'commit',
        icon: '\uD83D\uDCBE',
        description: 'Ask agent to create a git commit',
        forward: true,
        handler: (args) => {
          this.sendToAgent(`Create a git commit. ${args}`.trim());
        },
      },
      {
        name: 'review',
        icon: '\uD83D\uDD0D',
        description: 'Ask agent to review code',
        forward: true,
        handler: (args) => {
          this.sendToAgent(`Review the code. ${args}`.trim());
        },
      },
      {
        name: 'plan',
        icon: '\uD83D\uDCCB',
        description: 'Ask agent to plan before acting',
        forward: true,
        handler: (args) => {
          this.sendToAgent(`Plan your approach first. ${args}`.trim());
        },
      },
      {
        name: 'test',
        icon: '\u2705',
        description: 'Ask agent to run tests',
        forward: true,
        handler: (args) => {
          this.sendToAgent(`Run the tests. ${args}`.trim());
        },
      },
    ];
  }

  // ── DOM Construction ──

  private buildDOM(): void {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'prompt-bar';

    // Command menu (hidden)
    this.commandMenu = this.buildCommandMenu();
    this.wrapper.appendChild(this.commandMenu);

    // Toolbar
    const toolbar = this.buildToolbar();
    this.wrapper.appendChild(toolbar);

    // Input row
    const inputRow = this.buildInputRow();
    this.wrapper.appendChild(inputRow);

    this.container.appendChild(this.wrapper);
  }

  private buildCommandMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'prompt-command-menu';
    menu.style.display = 'none';
    return menu;
  }

  private buildToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'prompt-toolbar';

    // Attach button (placeholder for Phase 4)
    const attachBtn = document.createElement('button');
    attachBtn.className = 'prompt-tool-btn';
    attachBtn.title = 'Attach file';
    attachBtn.textContent = '\uD83D\uDCCE';
    attachBtn.addEventListener('click', () => {
      this.addSystemMessage('File attachments coming soon.');
    });
    toolbar.appendChild(attachBtn);

    // Slash button
    const slashBtn = document.createElement('button');
    slashBtn.className = 'prompt-tool-btn';
    slashBtn.title = 'Slash commands';
    slashBtn.textContent = '/';
    slashBtn.addEventListener('click', () => {
      if (this.isCommandMenuVisible()) {
        this.hideCommandMenu();
      } else {
        this.textarea.value = '/';
        this.textarea.focus();
        this.showCommandMenu('');
      }
    });
    toolbar.appendChild(slashBtn);

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'prompt-toolbar-spacer';
    toolbar.appendChild(spacer);

    // Mode badge
    this.modeIndicator = document.createElement('div');
    this.modeIndicator.className = 'prompt-mode-badge';
    this.modeIndicator.dataset.mode = this.currentMode;
    this.modeIndicator.title = 'Click to switch mode';
    this.modeIndicator.addEventListener('click', () => this.cycleMode());

    const dot = document.createElement('span');
    dot.className = 'prompt-mode-dot';

    const label = document.createElement('span');
    label.className = 'prompt-mode-label';
    label.textContent = this.currentMode;

    this.modeIndicator.appendChild(dot);
    this.modeIndicator.appendChild(label);
    toolbar.appendChild(this.modeIndicator);

    return toolbar;
  }

  private buildInputRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prompt-input-row';

    // Focus badge (hidden by default)
    this.focusBadge = document.createElement('div');
    this.focusBadge.className = 'prompt-focus-badge';
    this.focusBadge.style.display = 'none';

    this.focusNameEl = document.createElement('span');
    this.focusNameEl.className = 'prompt-focus-name';

    const clearFocusBtn = document.createElement('button');
    clearFocusBtn.className = 'prompt-focus-clear';
    clearFocusBtn.textContent = '\u00D7'; // multiplication sign (x)
    clearFocusBtn.addEventListener('click', () => this.setFocusedAgent(null));

    this.focusBadge.appendChild(this.focusNameEl);
    this.focusBadge.appendChild(clearFocusBtn);
    row.appendChild(this.focusBadge);

    // Textarea
    this.textarea = document.createElement('textarea');
    this.textarea.className = 'prompt-textarea';
    this.textarea.placeholder = 'Command your agents... (/ for commands)';
    this.textarea.rows = 1;
    this.textarea.addEventListener('input', () => this.handleInput());
    this.textarea.addEventListener('keydown', (e) => this.handleKeyDown(e));
    row.appendChild(this.textarea);

    // Send button
    this.sendBtn = document.createElement('button') as HTMLButtonElement;
    this.sendBtn.className = 'prompt-send-btn';
    this.sendBtn.disabled = true;
    this.sendBtn.title = 'Send (Enter)';
    this.sendBtn.textContent = '\u25B6'; // right-pointing triangle
    this.sendBtn.addEventListener('click', () => this.send());
    row.appendChild(this.sendBtn);

    return row;
  }

  // ── Slash Command Menu ──

  private showCommandMenu(filter: string): void {
    this.filteredCommands = this.commands.filter((c) =>
      c.name.startsWith(filter.toLowerCase()),
    );

    if (this.filteredCommands.length === 0) {
      this.hideCommandMenu();
      return;
    }

    this.selectedCommandIndex = 0;
    this.renderCommandMenu();
    this.commandMenu.style.display = 'block';
  }

  private hideCommandMenu(): void {
    this.commandMenu.style.display = 'none';
    this.filteredCommands = [];
    this.selectedCommandIndex = 0;
  }

  private isCommandMenuVisible(): boolean {
    return this.commandMenu.style.display !== 'none';
  }

  private renderCommandMenu(): void {
    // Clear existing children safely
    while (this.commandMenu.firstChild) {
      this.commandMenu.removeChild(this.commandMenu.firstChild);
    }

    this.filteredCommands.forEach((cmd, i) => {
      const item = document.createElement('div');
      item.className = 'prompt-command-item' + (i === this.selectedCommandIndex ? ' selected' : '');

      const icon = document.createElement('span');
      icon.className = 'prompt-command-icon';
      icon.textContent = cmd.icon;

      const name = document.createElement('span');
      name.className = 'prompt-command-name';
      name.textContent = `/${cmd.name}`;

      const desc = document.createElement('span');
      desc.className = 'prompt-command-desc';
      desc.textContent = cmd.description;

      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(desc);

      item.addEventListener('click', () => {
        this.autocompleteCommand(i);
      });

      item.addEventListener('mouseenter', () => {
        this.selectedCommandIndex = i;
        this.updateCommandSelection();
      });

      this.commandMenu.appendChild(item);
    });
  }

  private updateCommandSelection(): void {
    const items = this.commandMenu.querySelectorAll('.prompt-command-item');
    items.forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedCommandIndex);
    });
  }

  private moveCommandSelection(delta: number): void {
    this.selectedCommandIndex = Math.max(
      0,
      Math.min(this.filteredCommands.length - 1, this.selectedCommandIndex + delta),
    );
    this.updateCommandSelection();

    // Scroll selected item into view
    const items = this.commandMenu.querySelectorAll('.prompt-command-item');
    items[this.selectedCommandIndex]?.scrollIntoView({ block: 'nearest' });
  }

  private autocompleteCommand(index: number): void {
    const cmd = this.filteredCommands[index];
    if (!cmd) return;
    this.textarea.value = `/${cmd.name} `;
    this.textarea.focus();
    this.hideCommandMenu();
    this.sendBtn.disabled = false;
  }

  private executeSelectedCommand(): void {
    const cmd = this.filteredCommands[this.selectedCommandIndex];
    if (!cmd) return;
    this.textarea.value = `/${cmd.name} `;
    this.textarea.focus();
    this.hideCommandMenu();
    this.sendBtn.disabled = false;
  }

  // ── Input Handling ──

  private handleInput(): void {
    const value = this.textarea.value;
    this.autoResize();
    this.sendBtn.disabled = !value.trim();

    // Detect slash command
    if (value.startsWith('/')) {
      const match = value.match(/^\/(\S*)$/);
      if (match) {
        this.showCommandMenu(match[1]);
      } else {
        this.hideCommandMenu();
      }
    } else {
      this.hideCommandMenu();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Stop propagation to prevent Phaser from receiving keyboard events
    e.stopPropagation();

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (this.isCommandMenuVisible()) {
        this.executeSelectedCommand();
      } else {
        this.send();
      }
      return;
    }

    if (e.key === 'Escape') {
      if (this.isCommandMenuVisible()) {
        this.hideCommandMenu();
      } else {
        this.textarea.blur();
      }
      return;
    }

    if (this.isCommandMenuVisible()) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.moveCommandSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveCommandSelection(-1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.autocompleteCommand(this.selectedCommandIndex);
      }
    }
  }

  private send(): void {
    const text = this.textarea.value.trim();
    if (!text) return;

    // Check for slash command
    const cmdMatch = text.match(/^\/(\S+)(?:\s+(.*))?$/);
    if (cmdMatch) {
      const cmdName = cmdMatch[1].toLowerCase();
      const cmdArgs = (cmdMatch[2] || '').trim();
      const cmd = this.commands.find((c) => c.name === cmdName);
      if (cmd) {
        cmd.handler(cmdArgs);
        this.textarea.value = '';
        this.autoResize();
        this.sendBtn.disabled = true;
        this.hideCommandMenu();
        return;
      }
    }

    // Show player message in log
    this.options.onPlayerMessage?.(text);

    // Regular message - prefix with focused agent if set
    let messageText = text;
    if (this.focusedAgent) {
      messageText = `${this.focusedAgent}, ${text}`;
    }

    this.ws.send({ type: 'player:command', text: messageText });

    this.textarea.value = '';
    this.autoResize();
    this.sendBtn.disabled = true;
  }

  // ── Helpers ──

  private autoResize(): void {
    this.textarea.style.height = 'auto';
    const maxH = 128; // ~8rem
    this.textarea.style.height = Math.min(this.textarea.scrollHeight, maxH) + 'px';
  }

  private cycleMode(): void {
    const modes: AutonomyMode[] = ['manual', 'supervised', 'autonomous'];
    const idx = modes.indexOf(this.currentMode);
    this.currentMode = modes[(idx + 1) % modes.length];
    this.updateModeDisplay();
    this.addSystemMessage(`Mode: ${this.currentMode}`);
    this.ws.send({
      type: 'player:update-settings',
      settings: { autonomy_mode: this.currentMode },
    });
  }

  private updateModeDisplay(): void {
    this.modeIndicator.dataset.mode = this.currentMode;
    const label = this.modeIndicator.querySelector('.prompt-mode-label')!;
    label.textContent = this.currentMode;
  }

  private sendToAgent(text: string): void {
    this.options.onPlayerMessage?.(text);
    let messageText = text;
    if (this.focusedAgent) {
      messageText = `${this.focusedAgent}, ${text}`;
    }
    this.ws.send({ type: 'player:command', text: messageText });
  }

  private addSystemMessage(text: string): void {
    window.dispatchEvent(
      new CustomEvent('prompt-system-message', { detail: { text } }),
    );
  }
}
