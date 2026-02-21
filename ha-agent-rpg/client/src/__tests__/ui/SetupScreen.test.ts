import { describe, it, expect, vi } from 'vitest';
import { SetupScreen } from '../../screens/SetupScreen';

function makeScreen(onSubmit = vi.fn(), onBack = vi.fn()) {
  document.body.innerHTML = '<div id="setup-screen"></div>';
  return new SetupScreen(onSubmit, onBack);
}

describe('SetupScreen', () => {
  it('does not submit when both problem and repoInput are empty', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits when only problem is filled', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const textarea = document.querySelector<HTMLTextAreaElement>('.setup-textarea')!;
    textarea.value = 'How do we improve onboarding?';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).toHaveBeenCalledWith('How do we improve onboarding?', undefined);
  });

  it('submits when only repoInput is filled', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const repoInput = document.querySelector<HTMLInputElement>('.setup-repo-input')!;
    repoInput.value = '/tmp/myproject';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).toHaveBeenCalledWith('', '/tmp/myproject');
  });

  it('submits with both fields when both are filled', () => {
    const onSubmit = vi.fn();
    const screen = makeScreen(onSubmit);
    screen.show();
    const nameInput = document.querySelector<HTMLInputElement>('.rpg-input')!;
    nameInput.value = 'Alice';
    const textarea = document.querySelector<HTMLTextAreaElement>('.setup-textarea')!;
    textarea.value = 'Improve the architecture';
    const repoInput = document.querySelector<HTMLInputElement>('.setup-repo-input')!;
    repoInput.value = 'https://github.com/owner/repo';
    const btn = document.querySelector<HTMLButtonElement>('.rpg-btn')!;
    btn.click();
    expect(onSubmit).toHaveBeenCalledWith('Improve the architecture', 'https://github.com/owner/repo');
  });
});
