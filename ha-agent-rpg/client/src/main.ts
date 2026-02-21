import Phaser from 'phaser';
import { gameConfig } from './config';
import { WebSocketClient } from './network/WebSocketClient';
import { TitleScreen } from './screens/TitleScreen';
import { RepoScreen } from './screens/RepoScreen';
import { PromptBar } from './panels/PromptBar';
import { MiniMap } from './panels/MiniMap';
import { QuestLog } from './panels/QuestLog';
import type {
  RepoReadyMessage,
  ProcessStartedMessage,
  AgentJoinedMessage,
  AgentActivityMessage,
  FindingsPostedMessage,
  ErrorMessage,
  RealmListMessage,
  RealmRemovedMessage,
  MapNodeSummary,
  PlayerPresence,
  WorldStateMessage,
  QuestUpdateMessage,
} from './types';

// ── Connect to the bridge immediately ──
const ws = new WebSocketClient('ws://localhost:3001');
ws.connect();

// ── Screen instances ──
let titleScreen: TitleScreen;
let repoScreen: RepoScreen;
let gameStarted = false;

// ── 1. Title Screen ──
titleScreen = new TitleScreen(() => {
  titleScreen.hide();
  repoScreen.show();
  ws.send({ type: 'player:list-realms' });
});

// ── 2. Repo Screen (now the brainstorm problem input screen) ──
repoScreen = new RepoScreen(
  (problem: string) => {
    repoScreen.showLoading();
    ws.send({ type: 'player:start-process', problem });
  },
  () => {
    repoScreen.hide();
    titleScreen.show();
  },
  (realmId: string) => {
    ws.send({ type: 'player:resume-realm', realm_id: realmId });
  },
  (realmId: string) => {
    ws.send({ type: 'player:remove-realm', realm_id: realmId });
  },
);

// ── WebSocket event handlers ──

// New flow: brainstorming process started — enter game
ws.on('process:started', (msg) => {
  const data = msg as unknown as ProcessStartedMessage;
  console.log(`[Process] "${data.problem}" — stage: ${data.currentStageName}`);
  startGame();
});

// Legacy flow: repo ready (kept for backwards compatibility during transition)
ws.on('repo:ready', (_msg) => {
  const _data = _msg as unknown as RepoReadyMessage;
  startGame();
});

// When an agent joins during gameplay
ws.on('agent:joined', (msg) => {
  const data = msg as unknown as AgentJoinedMessage;
  console.log(`[Agent Joined] ${data.agent.name} (${data.agent.role}) — realm: ${data.agent.realm}`);
});

// Agent activity updates
ws.on('agent:activity', (msg) => {
  const data = msg as unknown as AgentActivityMessage;
  console.log(`[Activity] ${data.agent_id}: ${data.activity}`);
});

// Findings posted
ws.on('findings:posted', (msg) => {
  const data = msg as unknown as FindingsPostedMessage;
  console.log(`[Finding] ${data.agent_name} (${data.severity}): ${data.finding}`);
});

// Handle errors from server
ws.on('error', (msg) => {
  const data = msg as unknown as ErrorMessage;
  repoScreen.showError(data.message);
});

// Realm list received
ws.on('realm:list', (msg) => {
  const data = msg as unknown as RealmListMessage;
  repoScreen.updateRealmList(data.realms);
});

// Realm removed confirmation
ws.on('realm:removed', (_msg) => {
  // Request updated list
  ws.send({ type: 'player:list-realms' });
});

// Quest updates from world state
ws.on('world:state', (msg) => {
  const state = msg as unknown as WorldStateMessage;
  if (questLog && state.quests) {
    questLog.setQuests(state.quests);
  }
});

ws.on('quest:update', (msg) => {
  const data = msg as unknown as QuestUpdateMessage;
  if (questLog) {
    questLog.updateQuestStatus(data.quest_id, data.status, data.agent_id);
  }
});

let phaserGame: Phaser.Game | null = null;
let promptBar: PromptBar | null = null;
let miniMap: MiniMap | null = null;
let questLog: QuestLog | null = null;

// ── Start the Phaser game ──
function startGame(): void {
  if (gameStarted) return;
  gameStarted = true;

  // Hide all onboarding screens
  titleScreen.hide();
  repoScreen.hide();

  // Show game viewport
  const viewport = document.getElementById('game-viewport')!;
  viewport.style.display = 'flex';
  viewport.classList.remove('screen-hidden');

  // Launch Phaser
  if (!phaserGame) {
    phaserGame = new Phaser.Game(gameConfig);
  }

  // Launch PromptBar in the sidebar
  if (promptBar) {
    promptBar.destroy();
  }
  promptBar = new PromptBar('sidebar', ws, {
    onClearLog: () => {
      const logEl = document.getElementById('dialogue-log')!;
      while (logEl.firstChild) {
        logEl.removeChild(logEl.firstChild);
      }
    },
    onToggleSettings: () => {
      const panel = document.getElementById('settings-panel')!;
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    onShowQuests: () => {
      const panel = document.getElementById('quest-log')!;
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },
    onPlayerMessage: (text: string) => {
      // Dispatch event for DialogueLog to pick up
      window.dispatchEvent(
        new CustomEvent('prompt-player-message', { detail: { text } }),
      );
    },
  });

  // Instantiate QuestLog
  questLog = new QuestLog('quest-log');

  // Mount MiniMap overlay on the game container
  if (miniMap) {
    miniMap.destroy();
  }
  const gameContainer = document.getElementById('game-container')!;
  // game-container needs relative positioning for the absolute MiniMap overlay
  if (gameContainer.style.position !== 'relative') {
    gameContainer.style.position = 'relative';
  }
  miniMap = new MiniMap(gameContainer);

  // Wire MiniMap to GameScene events once Phaser is ready
  function wireMinimapToScene(scene: Phaser.Scene): void {
    scene.events.on('realm-tree', (root: MapNodeSummary) => {
      miniMap?.setTree(root);
    });
    scene.events.on('realm-presence', (players: PlayerPresence[]) => {
      miniMap?.updatePresence(players);
    });
  }

  phaserGame.events.once('ready', () => {
    const gameScene = phaserGame!.scene.getScene('GameScene');
    if (!gameScene) return;
    // GameScene.create() may not have run yet; use lifecycle event if needed
    if (gameScene.sys.isActive()) {
      wireMinimapToScene(gameScene);
    } else {
      gameScene.events.once('create', () => wireMinimapToScene(gameScene!));
    }
  });
}

function stopGame(): void {
  gameStarted = false;

  // Hide game viewport
  const viewport = document.getElementById('game-viewport')!;
  viewport.style.display = 'none';
  viewport.classList.add('screen-hidden');

  // Destroy PromptBar
  if (promptBar) {
    promptBar.destroy();
    promptBar = null;
  }

  // Hide quest log panel
  const questPanel = document.getElementById('quest-log');
  if (questPanel) questPanel.style.display = 'none';
  questLog = null;

  // Destroy MiniMap
  if (miniMap) {
    miniMap.destroy();
    miniMap = null;
  }

  // Destroy Phaser game
  if (phaserGame) {
    phaserGame.destroy(true);
    phaserGame = null;
  }
}

// Listen for quit request from PromptBar
window.addEventListener('prompt-quit-game', () => {
  stopGame();
  repoScreen.show();
  ws.send({ type: 'player:list-realms' });
});
