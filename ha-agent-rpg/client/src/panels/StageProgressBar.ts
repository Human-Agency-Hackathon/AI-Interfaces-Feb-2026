/**
 * StageProgressBar — DOM overlay showing brainstorm stage progress.
 * Sits at the top of the sidebar. Updates on stage:advanced events.
 */

export class StageProgressBar {
  private wrapper: HTMLElement;
  private stageLabel: HTMLElement;
  private progressText: HTMLElement;
  private progressFill: HTMLElement;

  constructor(parentId: string) {
    const parent = document.getElementById(parentId)!;

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'stage-progress-bar';

    this.stageLabel = document.createElement('div');
    this.stageLabel.className = 'stage-progress-label';
    this.stageLabel.textContent = 'Starting...';

    const progressRow = document.createElement('div');
    progressRow.className = 'stage-progress-row';

    const progressTrack = document.createElement('div');
    progressTrack.className = 'stage-progress-track';

    this.progressFill = document.createElement('div');
    this.progressFill.className = 'stage-progress-fill';
    this.progressFill.style.width = '0%';

    progressTrack.appendChild(this.progressFill);

    this.progressText = document.createElement('span');
    this.progressText.className = 'stage-progress-text';
    this.progressText.textContent = '';

    progressRow.appendChild(progressTrack);
    progressRow.appendChild(this.progressText);

    this.wrapper.appendChild(this.stageLabel);
    this.wrapper.appendChild(progressRow);

    // Insert at the top of the sidebar
    parent.insertBefore(this.wrapper, parent.firstChild);
  }

  /** Show the progress bar and set the initial stage */
  setInitialStage(stageName: string, totalStages: number): void {
    this.stageLabel.textContent = stageName;
    this.progressText.textContent = `STAGE 1 / ${totalStages}`;
    this.progressFill.style.width = `${(1 / totalStages) * 100}%`;
  }

  /** Update when a stage advances */
  advance(toStageName: string | null, stageIndex: number, totalStages: number): void {
    if (toStageName) {
      this.stageLabel.textContent = toStageName;
      this.progressText.textContent = `STAGE ${stageIndex + 1} / ${totalStages}`;
      this.progressFill.style.width = `${((stageIndex + 1) / totalStages) * 100}%`;
    } else {
      // Process complete
      this.stageLabel.textContent = 'Session Complete';
      this.progressText.textContent = `${totalStages} / ${totalStages}`;
      this.progressFill.style.width = '100%';
      this.progressFill.classList.add('stage-progress-complete');
    }
  }

  destroy(): void {
    this.wrapper.remove();
  }
}
