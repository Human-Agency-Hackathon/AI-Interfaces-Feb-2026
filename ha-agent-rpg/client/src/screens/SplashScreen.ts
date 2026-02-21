export class SplashScreen {
  private container: HTMLElement;
  private onStart: () => void;

  constructor(onStart: () => void) {
    this.container = document.getElementById('splash-screen')!;
    this.onStart = onStart;
    this.render();
  }

  private render(): void {
    this.container.textContent = '';

    const panel = document.createElement('div');
    panel.className = 'rpg-panel';
    panel.style.textAlign = 'center';

    // Top decorative divider
    const topDivider = document.createElement('div');
    topDivider.className = 'splash-divider';
    topDivider.textContent = '\u2726 \u2726 \u2726';
    panel.appendChild(topDivider);

    // Logo
    const logo = document.createElement('div');
    logo.className = 'splash-logo';
    const line1 = document.createTextNode('Agent');
    const br = document.createElement('br');
    const line2 = document.createTextNode('Dungeon');
    logo.appendChild(line1);
    logo.appendChild(br);
    logo.appendChild(line2);
    panel.appendChild(logo);

    // Tagline
    const tagline = document.createElement('div');
    tagline.className = 'splash-tagline';
    tagline.textContent = 'AI agents brainstorm your hardest problems';
    panel.appendChild(tagline);

    // Bottom decorative divider
    const bottomDivider = document.createElement('div');
    bottomDivider.className = 'splash-divider';
    bottomDivider.textContent = '\u2726 \u2726 \u2726';
    panel.appendChild(bottomDivider);

    // CTA button
    const btnWrap = document.createElement('div');
    btnWrap.style.display = 'flex';
    btnWrap.style.justifyContent = 'center';

    const btn = document.createElement('button');
    btn.className = 'rpg-btn rpg-btn-large';
    btn.id = 'btn-enter-dungeon';
    btn.textContent = 'Enter the Dungeon';
    btn.addEventListener('click', () => this.onStart());
    btnWrap.appendChild(btn);
    panel.appendChild(btnWrap);

    // Version
    const version = document.createElement('div');
    version.className = 'splash-version';
    version.textContent = 'v0.3.0';
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
