import type { MapNodeSummary, PlayerPresence } from '../types.js';

export class MiniMap {
  private container: HTMLDivElement;
  private treeRoot: MapNodeSummary | null = null;
  private players: PlayerPresence[] = [];

  constructor(parentEl: HTMLElement) {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      top: '12px',
      right: '12px',
      width: '200px',
      maxHeight: '300px',
      overflowY: 'auto',
      background: 'rgba(0,0,0,0.75)',
      border: '1px solid #444',
      borderRadius: '6px',
      padding: '8px',
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ccc',
      zIndex: '100',
    });
    parentEl.appendChild(this.container);
  }

  setTree(root: MapNodeSummary): void {
    this.treeRoot = root;
    this.render();
  }

  updatePresence(players: PlayerPresence[]): void {
    this.players = players;
    this.render();
  }

  private render(): void {
    if (!this.treeRoot) return;

    // Clear existing children safely (no innerHTML)
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    const title = document.createElement('div');
    title.textContent = 'Map';
    Object.assign(title.style, { fontWeight: 'bold', marginBottom: '6px', color: '#fff' });
    this.container.appendChild(title);

    this.renderNode(this.treeRoot, this.container, 0);
  }

  private renderNode(
    node: MapNodeSummary,
    parent: HTMLElement,
    depth: number,
  ): void {
    const playersHere = this.players.filter(p => p.path === node.path);

    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '2px 0',
      paddingLeft: `${depth * 12}px`,
    });

    const label = document.createElement('span');
    label.textContent = node.name || '(root)';
    label.style.color = node.type === 'folder' ? '#8ab4f8' : '#aaa';
    row.appendChild(label);

    if (playersHere.length > 0) {
      const dots = document.createElement('span');
      dots.style.marginLeft = '6px';
      dots.style.color = '#f4c542';
      dots.title = playersHere.map(p => p.name).join(', ');
      playersHere.forEach(() => {
        dots.appendChild(document.createTextNode('\u25CF'));
      });
      row.appendChild(dots);
    }

    parent.appendChild(row);

    // Only render folder children (skip files to keep compact)
    for (const child of node.children.filter(c => c.type === 'folder')) {
      this.renderNode(child, parent, depth + 1);
    }
  }

  destroy(): void {
    this.container.remove();
  }
}
