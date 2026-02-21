import type { RealmEntryWithChanges } from '../types.js';

export class RepoScreen {
  private container: HTMLElement;
  private onAnalyze: (repoUrl: string) => void;
  private onBack: () => void;
  private onResume: (realmId: string) => void;
  private onRemove: (realmId: string) => void;

  private inputEl: HTMLInputElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private loadingArea: HTMLElement | null = null;
  private errorArea: HTMLElement | null = null;
  private realmListContainer: HTMLElement | null = null;

  constructor(
    onAnalyze: (repoUrl: string) => void,
    onBack: () => void,
    onResume: (realmId: string) => void,
    onRemove: (realmId: string) => void,
  ) {
    this.container = document.getElementById('repo-screen')!;
    this.onAnalyze = onAnalyze;
    this.onBack = onBack;
    this.onResume = onResume;
    this.onRemove = onRemove;
    this.render();
  }

  private render(): void {
    this.container.textContent = '';

    const panel = document.createElement('div');
    panel.className = 'rpg-panel';

    // Header
    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'Link Repository';
    panel.appendChild(title);

    // Subtext
    const subtitle = document.createElement('div');
    subtitle.className = 'screen-subtitle';
    subtitle.textContent = 'Enter a local repo path or GitHub URL to generate your quest world';
    panel.appendChild(subtitle);

    // Form row
    const form = document.createElement('div');
    form.className = 'repo-form';

    this.inputEl = document.createElement('input');
    this.inputEl.type = 'text';
    this.inputEl.className = 'rpg-input';
    this.inputEl.placeholder = 'Local path or GitHub URL (e.g. /Users/you/project)';
    this.inputEl.spellcheck = false;
    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.handleSubmit();
    });
    form.appendChild(this.inputEl);

    this.submitBtn = document.createElement('button');
    this.submitBtn.className = 'rpg-btn';
    this.submitBtn.textContent = 'Scan Realm';
    this.submitBtn.addEventListener('click', () => this.handleSubmit());
    form.appendChild(this.submitBtn);

    panel.appendChild(form);

    // Loading area (hidden by default)
    this.loadingArea = document.createElement('div');
    this.loadingArea.className = 'loading-area';
    this.loadingArea.style.display = 'none';

    const loadingText = document.createElement('div');
    loadingText.className = 'loading-dots';
    loadingText.textContent = '';

    const textNode = document.createTextNode('Scanning realm');
    loadingText.appendChild(textNode);

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.textContent = '.';
      loadingText.appendChild(dot);
    }

    this.loadingArea.appendChild(loadingText);
    panel.appendChild(this.loadingArea);

    // Error area (hidden by default)
    this.errorArea = document.createElement('div');
    this.errorArea.className = 'error-text';
    this.errorArea.style.display = 'none';
    panel.appendChild(this.errorArea);

    // Realm history list (hidden by default)
    this.realmListContainer = document.createElement('div');
    this.realmListContainer.className = 'realm-list';
    this.realmListContainer.style.display = 'none';
    panel.appendChild(this.realmListContainer);

    // Back link
    const backLink = document.createElement('div');
    backLink.className = 'back-link';
    backLink.textContent = '\u2190 Back';
    backLink.addEventListener('click', () => this.onBack());
    panel.appendChild(backLink);

    this.container.appendChild(panel);
  }

  private handleSubmit(): void {
    if (!this.inputEl) return;
    const url = this.inputEl.value.trim();
    if (!url) return;
    this.clearError();
    this.onAnalyze(url);
  }

  updateRealmList(realms: RealmEntryWithChanges[]): void {
    if (!this.realmListContainer) return;

    this.realmListContainer.textContent = '';

    if (realms.length === 0) {
      this.realmListContainer.style.display = 'none';
      return;
    }

    // Section title
    const sectionTitle = document.createElement('div');
    sectionTitle.className = 'realm-list-title';
    sectionTitle.textContent = 'Previously Explored Realms';
    this.realmListContainer.appendChild(sectionTitle);

    for (const realm of realms) {
      const card = this.createRealmCard(realm);
      this.realmListContainer.appendChild(card);
    }

    this.realmListContainer.style.display = 'block';
  }

  private createRealmCard(realm: RealmEntryWithChanges): HTMLElement {
    const card = document.createElement('div');
    card.className = 'realm-card';

    // Header row: name + date
    const header = document.createElement('div');
    header.className = 'realm-card-header';

    const name = document.createElement('span');
    name.className = 'realm-card-name';
    name.textContent = realm.displayName;
    header.appendChild(name);

    const date = document.createElement('span');
    date.className = 'realm-card-date';
    date.textContent = this.formatDate(realm.lastExplored);
    header.appendChild(date);

    card.appendChild(header);

    // Stats line: languages, files
    const statsLine = document.createElement('div');
    statsLine.className = 'realm-card-stats';
    const langs = realm.stats.languages.join(', ') || 'Unknown';
    statsLine.textContent = `${langs} \u00B7 ${realm.stats.totalFiles} files`;
    card.appendChild(statsLine);

    // Details line: agents, findings, quests
    const details = document.createElement('div');
    details.className = 'realm-card-stats';
    details.textContent = [
      `${realm.stats.agentsUsed} agent${realm.stats.agentsUsed !== 1 ? 's' : ''}`,
      `${realm.stats.findingsCount} finding${realm.stats.findingsCount !== 1 ? 's' : ''}`,
      `${realm.stats.questsCompleted}/${realm.stats.questsTotal} quests`,
    ].join(' \u00B7 ');
    card.appendChild(details);

    // Git changes line
    const changes = document.createElement('div');
    changes.className = 'realm-card-changes';
    if (realm.changesSinceLastScan === null) {
      changes.textContent = 'Change status unknown';
      changes.classList.add('realm-card-changes-unknown');
    } else if (realm.changesSinceLastScan === 0) {
      changes.textContent = 'Up to date';
      changes.classList.add('realm-card-changes-ok');
    } else {
      changes.textContent = `${realm.changesSinceLastScan} commit${realm.changesSinceLastScan !== 1 ? 's' : ''} since last scan`;
      changes.classList.add('realm-card-changes-stale');
    }
    card.appendChild(changes);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'realm-card-actions';

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'rpg-btn realm-btn';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => {
      this.showLoading();
      this.onResume(realm.id);
    });
    actions.appendChild(resumeBtn);

    const rescanBtn = document.createElement('button');
    rescanBtn.className = 'rpg-btn realm-btn';
    rescanBtn.textContent = 'Re-scan';
    rescanBtn.addEventListener('click', () => {
      if (this.inputEl) this.inputEl.value = realm.path;
      this.handleSubmit();
    });
    actions.appendChild(rescanBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'rpg-btn realm-btn realm-btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      if (confirm(`Remove "${realm.displayName}" from history?`)) {
        this.onRemove(realm.id);
        card.remove();
      }
    });
    actions.appendChild(removeBtn);

    card.appendChild(actions);

    return card;
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  showLoading(): void {
    if (this.loadingArea) this.loadingArea.style.display = 'block';
    if (this.inputEl) this.inputEl.disabled = true;
    if (this.submitBtn) this.submitBtn.disabled = true;
  }

  hideLoading(): void {
    if (this.loadingArea) this.loadingArea.style.display = 'none';
    if (this.inputEl) this.inputEl.disabled = false;
    if (this.submitBtn) this.submitBtn.disabled = false;
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
    setTimeout(() => this.inputEl?.focus(), 50);
  }

  hide(): void {
    this.container.style.display = 'none';
    this.container.classList.add('screen-hidden');
    this.hideLoading();
    this.clearError();
  }
}
