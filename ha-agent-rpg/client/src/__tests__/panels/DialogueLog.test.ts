import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DialogueLog } from '../../panels/DialogueLog';

describe('DialogueLog', () => {
  let container: HTMLElement;
  let log: DialogueLog;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'dialogue-log';
    document.body.appendChild(container);
    log = new DialogueLog('dialogue-log');
  });

  afterEach(() => {
    container.remove();
  });

  // ── addOracleNotification ──

  it('addOracleNotification appends a bubble with the oracle CSS class', () => {
    log.addOracleNotification('The Oracle has decided: Code Review with 4 heroes');
    const bubble = container.querySelector('.chat-bubble-oracle');
    expect(bubble).toBeTruthy();
    expect(bubble!.textContent).toBe('The Oracle has decided: Code Review with 4 heroes');
  });

  it('addOracleNotification increments the entry count', () => {
    log.addOracleNotification('message one');
    log.addOracleNotification('message two');
    expect(container.querySelectorAll('.chat-bubble-oracle').length).toBe(2);
  });

  // ── oracle-decision window event ──

  it('oracle-decision window event calls addOracleNotification with the detail text', () => {
    window.dispatchEvent(new CustomEvent('oracle-decision', {
      detail: { text: 'The Oracle has decided: Brainstorm with 3 heroes' },
    }));
    const bubble = container.querySelector('.chat-bubble-oracle');
    expect(bubble).toBeTruthy();
    expect(bubble!.textContent).toBe('The Oracle has decided: Brainstorm with 3 heroes');
  });

  // ── hero-summoned window event ──

  it('hero-summoned window event appends an oracle notification with the hero name', () => {
    window.dispatchEvent(new CustomEvent('hero-summoned', {
      detail: { text: 'The Sentinel has been summoned!' },
    }));
    const bubble = container.querySelector('.chat-bubble-oracle');
    expect(bubble).toBeTruthy();
    expect(bubble!.textContent).toBe('The Sentinel has been summoned!');
  });

  // ── hero-dismissed window event ──

  it('hero-dismissed window event appends a notification with agentId and reason', () => {
    window.dispatchEvent(new CustomEvent('hero-dismissed', {
      detail: { agentId: 'scout_1', reason: 'No longer needed' },
    }));
    const bubble = container.querySelector('.chat-bubble-oracle');
    expect(bubble).toBeTruthy();
    expect(bubble!.textContent).toBe('scout_1 has been dismissed: No longer needed');
  });

  it('hero-dismissed without reason still shows a dismissal message', () => {
    window.dispatchEvent(new CustomEvent('hero-dismissed', {
      detail: { agentId: 'scout_1', reason: '' },
    }));
    const bubble = container.querySelector('.chat-bubble-oracle');
    expect(bubble).toBeTruthy();
    expect(bubble!.textContent).toBe('scout_1 has been dismissed');
  });
});
