export class SidebarPanel {
  private container: HTMLElement;

  constructor() {
    this.container = document.getElementById('sidebar')!;
  }

  show(): void {
    this.container.style.display = 'flex';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  // Create inner panel sections
  createSection(id: string, title: string): HTMLElement {
    const section = document.createElement('div');
    section.id = id;
    section.className = 'sidebar-section';

    const titleEl = document.createElement('div');
    titleEl.className = 'sidebar-section-title';
    titleEl.textContent = title;

    const contentEl = document.createElement('div');
    contentEl.className = 'sidebar-section-content';
    contentEl.id = `${id}-content`;

    section.appendChild(titleEl);
    section.appendChild(contentEl);
    this.container.appendChild(section);
    return section;
  }
}
