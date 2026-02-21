import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 640,   // 20 tiles * 32px
  height: 480,  // 15 tiles * 32px
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
  pixelArt: true,
  scene: [BootScene, GameScene, UIScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  callbacks: {
    postBoot: (game) => {
      game.canvas.setAttribute('tabindex', '0');
      game.canvas.focus();
    },
  },
};
