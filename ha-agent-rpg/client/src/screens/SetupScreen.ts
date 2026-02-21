export interface SetupIdentity {
  name: string;
  color: number;
}

const COLORS: Array<{ hex: number; css: string }> = [
  { hex: 0xff3300, css: '#ff3300' },
  { hex: 0x00cc66, css: '#00cc66' },
  { hex: 0x3366ff, css: '#3366ff' },
  { hex: 0xffcc00, css: '#ffcc00' },
  { hex: 0xcc44ff, css: '#cc44ff' },
  { hex: 0xff9933, css: '#ff9933' },
  { hex: 0x00ccff, css: '#00ccff' },
  { hex: 0xff66aa, css: '#ff66aa' },
];

const LOADING_MESSAGES = [
  'Agents assembling in the dungeon\u2026',
  'Lighting the torches\u2026',
  'Summoning your council of advisors\u2026',
  'Preparing the brainstorm chambers\u2026',
  'Cloning the repository\u2026',
  'Exploring the codebase\u2026',
];

export class SetupScreen {
  private container: HTMLElement;
  private onSubmit: (problem: string, repoInput?: string) => void;
  private onBack: () => void;

  private formEl: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private problemTextarea: HTMLTextAreaElement | null = null;
  private repoInput: HTMLInputElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private loadingEl: HTMLElement | null = null;
  private errorArea: HTMLElement | null = null;
  private selectedColor = COLORS[Math.floor(Math.random() * COLORS.length)];

  constructor(
    onSubmit: (problem: string, repoInput?: string) => void,
    onBack: () => void,
  ) {
    this.container = document.getElementById('setup-screen')!;
    this.onSubmit = onSubmit;
    this.onBack = onBack;
    this.render();
  }

  private render(): void {
    this.container.textContent = '';

    const panel = document.createElement('div');
    panel.className = 'rpg-panel';

    // Header
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'Prepare Your Session';
    panel.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'screen-subtitle';
    subtitle.textContent = 'Identify yourself and describe what to brainstorm.';
    panel.appendChild(subtitle);

    // Form wrapper (hidden during loading)
    this.formEl = document.createElement('div');

    // ── Name Section ──
    const nameSection = document.createElement('div');
    nameSection.className = 'setup-section';

    const nameLabel = document.createElement('label');
    nameLabel.className = 'setup-label';
    nameLabel.textContent = 'Your Name';
    nameSection.appendChild(nameLabel);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.className = 'rpg-input';
    this.nameInput.placeholder = 'e.g. Alice';
    this.nameInput.maxLength = 20;
    this.nameInput.spellcheck = false;
    nameSection.appendChild(this.nameInput);

    this.formEl.appendChild(nameSection);

    // ── Color Section ──
    const colorSection = document.createElement('div');
    colorSection.className = 'setup-section';

    const colorLabel = document.createElement('label');
    colorLabel.className = 'setup-label';
    colorLabel.textContent = 'Your Color';
    colorSection.appendChild(colorLabel);

    const colorRow = document.createElement('div');
    colorRow.className = 'setup-color-row';

    COLORS.forEach((c) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'setup-color-swatch' + (c.hex === this.selectedColor.hex ? ' selected' : '');
      swatch.style.background = c.css;
      swatch.title = c.css;
      swatch.addEventListener('click', () => {
        this.selectedColor = c;
        colorRow.querySelectorAll<HTMLElement>('.setup-color-swatch').forEach((s) => {
          s.classList.toggle('selected', s.style.background === c.css);
        });
      });
      colorRow.appendChild(swatch);
    });

    colorSection.appendChild(colorRow);
    this.formEl.appendChild(colorSection);

    // ── Problem Section ──
    const problemSection = document.createElement('div');
    problemSection.className = 'setup-section';

    const problemLabel = document.createElement('label');
    problemLabel.className = 'setup-label';
    problemLabel.textContent = 'What should agents brainstorm?';
    problemSection.appendChild(problemLabel);

    this.problemTextarea = document.createElement('textarea');
    this.problemTextarea.className = 'setup-textarea';
    this.problemTextarea.placeholder = 'e.g. How do we reduce user onboarding time by 50%?';
    this.problemTextarea.spellcheck = true;
    problemSection.appendChild(this.problemTextarea);

    this.formEl.appendChild(problemSection);

    // ── Repo Section ──
    const repoSection = document.createElement('div');
    repoSection.className = 'setup-section';

    const repoLabel = document.createElement('label');
    repoLabel.className = 'setup-label';
    repoLabel.textContent = 'GitHub URL or Local Folder Path (optional)';
    repoSection.appendChild(repoLabel);

    this.repoInput = document.createElement('input');
    this.repoInput.type = 'text';
    this.repoInput.className = 'rpg-input setup-repo-input';
    this.repoInput.placeholder = 'e.g. https://github.com/owner/repo or /Users/alice/myproject';
    this.repoInput.spellcheck = false;
    repoSection.appendChild(this.repoInput);

    this.formEl.appendChild(repoSection);

    // ── Submit Button ──
    const submitRow = document.createElement('div');
    submitRow.className = 'setup-submit-row';

    this.submitBtn = document.createElement('button');
    this.submitBtn.className = 'rpg-btn rpg-btn-large';
    this.submitBtn.textContent = 'Begin Session';
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
    submitRow.appendChild(this.submitBtn);

    this.formEl.appendChild(submitRow);

    panel.appendChild(this.formEl);

    // ── Loading overlay (hidden by default) ──
    this.loadingEl = document.createElement('div');
    this.loadingEl.className = 'setup-loading';
    this.loadingEl.style.display = 'none';

    const loadingText = document.createElement('div');
    loadingText.className = 'setup-loading-text';
    loadingText.textContent = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    this.loadingEl.appendChild(loadingText);

    const loadingDots = document.createElement('div');
    loadingDots.className = 'loading-dots';
    const dotsText = document.createTextNode('Starting');
    loadingDots.appendChild(dotsText);
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.textContent = '.';
      loadingDots.appendChild(dot);
    }
    this.loadingEl.appendChild(loadingDots);

    panel.appendChild(this.loadingEl);

    // ── Error area (hidden by default) ──
    this.errorArea = document.createElement('div');
    this.errorArea.className = 'error-text';
    this.errorArea.style.display = 'none';
    panel.appendChild(this.errorArea);

    // ── Back link ──
    const backLink = document.createElement('div');
    backLink.className = 'back-link';
    backLink.textContent = '\u2190 Back';
    backLink.addEventListener('click', () => this.onBack());
    panel.appendChild(backLink);

    this.container.appendChild(panel);

    // Enter key on name input moves to problem textarea
    this.nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.problemTextarea?.focus();
      }
    });

    // Ctrl/Cmd+Enter on textarea submits
    this.problemTextarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.handleSubmit();
      }
    });
  }

  private handleSubmit(): void {
    if (!this.nameInput || !this.problemTextarea) return;

    const name = this.nameInput.value.trim();
    const problem = this.problemTextarea.value.trim();
    const repoInput = this.repoInput?.value.trim() || undefined;

    if (!name) {
      this.nameInput.focus();
      return;
    }
    if (!problem && !repoInput) {
      this.problemTextarea.focus();
      return;
    }

    this.clearError();
    this.onSubmit(problem, repoInput);
  }

  getIdentity(): SetupIdentity {
    return {
      name: this.nameInput?.value.trim() || 'Spectator',
      color: this.selectedColor.hex,
    };
  }

  showLoading(): void {
    if (this.formEl) this.formEl.style.display = 'none';
    if (this.loadingEl) {
      // Pick a random flavor message
      const textEl = this.loadingEl.querySelector('.setup-loading-text');
      if (textEl) {
        textEl.textContent = LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
      }
      this.loadingEl.style.display = 'block';
    }
  }

  hideLoading(): void {
    if (this.loadingEl) this.loadingEl.style.display = 'none';
    if (this.formEl) this.formEl.style.display = 'block';
  }

  showError(message: string): void {
    this.hideLoading();
    if (this.errorArea) {
      this.errorArea.textContent = message;
      this.errorArea.style.display = 'block';
    }
  }

  clearError(): void {
    if (this.errorArea) {
      this.errorArea.textContent = '';
      this.errorArea.style.display = 'none';
    }
  }

  show(): void {
    this.container.style.display = 'flex';
    this.container.classList.remove('screen-hidden');
    setTimeout(() => this.nameInput?.focus(), 50);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.container.classList.add('screen-hidden');
    this.hideLoading();
    this.clearError();
  }
}
