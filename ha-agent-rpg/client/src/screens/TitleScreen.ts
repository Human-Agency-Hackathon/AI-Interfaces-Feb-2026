export class TitleScreen {
  private container: HTMLElement;
  private onStart: () => void;

  constructor(onStart: () => void) {
    this.container = document.getElementById('title-screen')!;
    this.onStart = onStart;
    this.render();
  }

  private render(): void {
    // Clear container
    this.container.textContent = '';

    // Build the panel
    const panel = document.createElement('div');
    panel.className = 'rpg-panel';
    panel.style.textAlign = 'center';

    // Top decorative divider
    const topDivider = document.createElement('div');
    topDivider.className = 'title-divider';
    topDivider.textContent = '- - - - - - - - - - - - - - - -';
    panel.appendChild(topDivider);

    // Title logo
    const logo = document.createElement('div');
    logo.className = 'title-logo';
    const line1 = document.createTextNode('Agent');
    const br = document.createElement('br');
    const line2 = document.createTextNode('RPG');
    logo.appendChild(line1);
    logo.appendChild(br);
    logo.appendChild(line2);
    panel.appendChild(logo);

    // Tagline
    const tagline = document.createElement('div');
    tagline.className = 'title-tagline';
    tagline.textContent = 'Orchestrate AI agents. Ship your project.';
    panel.appendChild(tagline);

    // Bottom decorative divider
    const bottomDivider = document.createElement('div');
    bottomDivider.className = 'title-divider';
    bottomDivider.textContent = '- - - - - - - - - - - - - - - -';
    panel.appendChild(bottomDivider);

    // Button wrapper
    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.justifyContent = 'center';

    const btn = document.createElement('button');
    btn.className = 'rpg-btn rpg-btn-large';
    btn.id = 'btn-begin-quest';
    btn.textContent = 'Begin Quest';
    btn.addEventListener('click', () => this.onStart());
    btnWrap.appendChild(btn);
    panel.appendChild(btnWrap);

    // Version
    const version = document.createElement('div');
    version.className = 'title-version';
    version.textContent = 'v0.2.0 \u2014 simulation mode';
    panel.appendChild(version);

    this.container.appendChild(panel);
  }

  show(): void {
    this.container.style.display = 'flex';
    this.container.classList.remove('screen-hidden');
  }

  hide(): void {
    this.container.style.display = 'none';
    this.container.classList.add('screen-hidden');
  }
}
