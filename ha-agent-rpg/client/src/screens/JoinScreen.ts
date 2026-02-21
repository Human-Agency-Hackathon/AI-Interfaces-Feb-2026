export interface SpectatorIdentity {
  name: string;
  color: number;
}

type JoinCallback = (identity: SpectatorIdentity) => void;

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

export class JoinScreen {
  private overlay: HTMLElement;
  private selectedColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  private nameInput!: HTMLInputElement;

  constructor(private onJoin: JoinCallback) {
    this.overlay = this.buildDOM();
    document.body.appendChild(this.overlay);
  }

  show(): void {
    this.overlay.style.display = 'flex';
    this.nameInput.focus();
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }

  destroy(): void {
    this.overlay.remove();
  }

  private buildDOM(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'join-overlay';
    overlay.style.display = 'none';

    const panel = document.createElement('div');
    panel.className = 'rpg-panel join-panel';

    const title = document.createElement('div');
    title.className = 'screen-title';
    title.textContent = 'JOIN AS SPECTATOR';
    panel.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'screen-subtitle';
    subtitle.textContent = 'Enter your name to start spectating and commanding agents';
    panel.appendChild(subtitle);

    // Name input
    const nameLabel = document.createElement('label');
    nameLabel.className = 'join-label';
    nameLabel.textContent = 'Your Name';
    panel.appendChild(nameLabel);

    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.className = 'rpg-input join-name-input';
    this.nameInput.placeholder = 'e.g. Alice';
    this.nameInput.maxLength = 20;
    panel.appendChild(this.nameInput);

    // Color picker
    const colorLabel = document.createElement('label');
    colorLabel.className = 'join-label';
    colorLabel.textContent = 'Your Color';
    panel.appendChild(colorLabel);

    const colorRow = document.createElement('div');
    colorRow.className = 'join-color-row';

    COLORS.forEach((c) => {
      const swatch = document.createElement('button');
      swatch.className = 'join-color-swatch' + (c.hex === this.selectedColor.hex ? ' selected' : '');
      swatch.style.background = c.css;
      swatch.title = c.css;
      swatch.addEventListener('click', () => {
        this.selectedColor = c;
        colorRow.querySelectorAll<HTMLElement>('.join-color-swatch').forEach((s) => {
          s.classList.toggle('selected', s.style.background === c.css);
        });
      });
      colorRow.appendChild(swatch);
    });

    panel.appendChild(colorRow);

    // Join button
    const joinBtn = document.createElement('button');
    joinBtn.className = 'rpg-btn rpg-btn-deploy join-btn';
    joinBtn.textContent = 'JOIN';
    joinBtn.addEventListener('click', () => this.handleJoin());
    panel.appendChild(joinBtn);

    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleJoin();
    });

    overlay.appendChild(panel);
    return overlay;
  }

  private handleJoin(): void {
    const name = this.nameInput.value.trim();
    if (!name) {
      this.nameInput.focus();
      return;
    }
    this.onJoin({ name, color: this.selectedColor.hex });
    this.hide();
  }
}
