import Phaser from 'phaser';
import { gameConfig } from './config';
import { WebSocketClient } from './network/WebSocketClient';
import { SplashScreen } from './screens/SplashScreen';
import { SetupScreen } from './screens/SetupScreen';
import type { SetupIdentity } from './screens/SetupScreen';
import { PromptBar } from './panels/PromptBar';
import { MiniMap } from './panels/MiniMap';
import { QuestLog } from './panels/QuestLog';
import { StageProgressBar } from './panels/StageProgressBar';
import { AgentRoster } from './panels/AgentRoster';
import type {
  RepoReadyMessage,
  ProcessStartedMessage,
  StageAdvancedMessage,
  AgentJoinedMessage,
  AgentLeftMessage,
  AgentActivityMessage,
  FindingsPostedMessage,
  ErrorMessage,
  MapNodeSummary,
  PlayerPresence,
  WorldStateMessage,
  QuestUpdateMessage,
  SpectatorWelcomeMessage,
  SpectatorJoinedMessage,
  SpectatorLeftMessage,
  SpectatorCommandMessage,
  SpectatorInfo,
  ServerInfoMessage,
  OracleDecisionMessage,
  HeroSummonedMessage,
  HeroDismissedMessage,
} from './types';

// ── Connect to the bridge immediately ──
// Use current hostname so LAN spectators connect back to the correct server
const wsHost = window.location.hostname || 'localhost';
const ws = new WebSocketClient(`ws://${wsHost}:3001`);
ws.connect();

// ── Toast notifications (Task 24/25) ──
function showToast(message: string, type: 'error' | 'warn' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' toast-error' : type === 'warn' ? ' toast-warn' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}


// ── Buffer early messages that arrive before GameScene is ready ──
// The server sends world:state and agent:joined right after process:started,
// but Phaser's BootScene/GameScene take time to initialize. Buffer them here
// and pass via the game registry so GameScene can replay on create().
let bufferedWorldState: Record<string, unknown> | null = null;
const bufferedAgentJoins: Record<string, unknown>[] = [];
const bufferedFogReveals: Record<string, unknown>[] = [];

ws.on('world:state', (msg) => {
  bufferedWorldState = msg;
  // Keep the registry in sync so GameScene can pick up the state even if
  // world:state arrives after startGame() but before GameScene.create().
  if (phaserGame) {
    phaserGame.registry.set('bufferedWorldState', msg);
  }
});
ws.on('agent:joined', (msg) => {
  bufferedAgentJoins.push(msg);
  if (phaserGame) {
    phaserGame.registry.set('bufferedAgentJoins', [...bufferedAgentJoins]);
  }
});
ws.on('fog:reveal', (msg) => {
  bufferedFogReveals.push(msg);
  if (phaserGame) {
    phaserGame.registry.set('bufferedFogReveals', [...bufferedFogReveals]);
  }
});

// ── Screen instances ──
let splashScreen: SplashScreen;
let setupScreen: SetupScreen;
let gameStarted = false;

// Identity collected from SetupScreen, passed into startGame
let pendingIdentity: SetupIdentity | null = null;

// ── 1. Splash Screen ──
splashScreen = new SplashScreen(() => {
  splashScreen.hide();
  setupScreen.show();
});

// ── 2. Setup Screen (name + color + problem input) ──
setupScreen = new SetupScreen(
  (problem: string, repoInput?: string) => {
    pendingIdentity = setupScreen.getIdentity();
    setupScreen.showLoading();
    ws.send({ type: 'player:start-process', problem, repoInput });
  },
  () => {
    setupScreen.hide();
    splashScreen.show();
  },
);

// ── WebSocket event handlers ──

// New flow: brainstorming process started — enter game
ws.on('process:started', (msg) => {
  const data = msg as unknown as ProcessStartedMessage;
  console.log(`[Process] "${data.problem}" — stage: ${data.currentStageName}`);
  startGame(pendingIdentity ?? { name: 'Spectator', color: 0xc45a28 });
  // Set initial stage on progress bar after game starts
  if (stageProgressBar) {
    stageProgressBar.setInitialStage(data.currentStageName, data.totalStages);
  }
  window.dispatchEvent(new CustomEvent('stage-announcement', {
    detail: { text: `Brainstorm started: "${data.problem}". Stage: ${data.currentStageName}` },
  }));
});

// Legacy flow: repo ready (kept for backwards compatibility during transition)
ws.on('repo:ready', (_msg) => {
  const _data = _msg as unknown as RepoReadyMessage;
  startGame(pendingIdentity ?? { name: 'Spectator', color: 0xc45a28 });
});

// When an agent joins during gameplay
ws.on('agent:joined', (msg) => {
  const data = msg as unknown as AgentJoinedMessage;
  console.log(`[Agent Joined] ${data.agent.name} (${data.agent.role}) — realm: ${data.agent.realm}`);
  agentRoster?.addAgent(data.agent);
  // Broadcast so UIScene and DialogueLog can show display names instead of raw IDs
  window.dispatchEvent(new CustomEvent('agent-joined', {
    detail: { agentId: data.agent.agent_id, name: data.agent.name, color: data.agent.color },
  }));
});

// Agent left — remove from roster
ws.on('agent:left', (msg) => {
  const data = msg as unknown as AgentLeftMessage;
  agentRoster?.removeAgent(data.agent_id);
});

// World state sync — keep roster up to date after reconnect
ws.on('world:state', (msg) => {
  const data = msg as unknown as WorldStateMessage;
  agentRoster?.syncAgents(data.agents);
});

// Agent activity updates
ws.on('agent:activity', (msg) => {
  const data = msg as unknown as AgentActivityMessage;
  console.log(`[Activity] ${data.agent_id}: ${data.activity}`);
});

// Findings posted — surface to DialogueLog
ws.on('findings:posted', (msg) => {
  const data = msg as unknown as FindingsPostedMessage;
  console.log(`[Finding] ${data.agent_name} (${data.severity}): ${data.finding}`);
  window.dispatchEvent(new CustomEvent('findings-posted', {
    detail: { agent_name: data.agent_name, finding: data.finding },
  }));
});

// Oracle decision — broadcast activity type and hero list to dialogue log
ws.on('oracle:decision', (msg) => {
  const data = msg as unknown as OracleDecisionMessage;
  const activityLabel = data.activityType === 'brainstorm'
    ? 'Brainstorm'
    : data.activityType === 'code_review'
      ? 'Code Review'
      : 'Code Brainstorm';
  const heroCount = data.heroes.length;
  window.dispatchEvent(new CustomEvent('oracle-decision', {
    detail: { text: `The Oracle has decided: ${activityLabel} with ${heroCount} hero${heroCount !== 1 ? 's' : ''}` },
  }));
});

// Hero summoned — announce new hero joining the process
ws.on('hero:summoned', (msg) => {
  const data = msg as unknown as HeroSummonedMessage;
  window.dispatchEvent(new CustomEvent('hero-summoned', {
    detail: { text: `${data.name} has been summoned!` },
  }));
});

// Hero dismissed — announce hero leaving the process
ws.on('hero:dismissed', (msg) => {
  const data = msg as unknown as HeroDismissedMessage;
  window.dispatchEvent(new CustomEvent('hero-dismissed', {
    detail: { agentId: data.agentId, reason: data.reason },
  }));
});

// Stage advanced — update progress bar and announce in dialogue
ws.on('stage:advanced', (msg) => {
  const data = msg as unknown as StageAdvancedMessage;
  console.log(`[Stage] ${data.fromStageName} -> ${data.toStageName ?? 'DONE'}`);
  if (stageProgressBar) {
    stageProgressBar.advance(data.toStageName, data.stageIndex, data.totalStages);
  }
  const announcement = data.toStageName
    ? `Stage complete: ${data.fromStageName}. Entering: ${data.toStageName}...`
    : `Session complete! Final stage "${data.fromStageName}" finished.`;
  window.dispatchEvent(new CustomEvent('stage-announcement', {
    detail: { text: announcement },
  }));
});

// Process complete — show overlay with next-step options; never auto-navigate away
ws.on('process:completed', (msg) => {
  const data = msg as any;
  const overlay = document.getElementById('session-complete-overlay');
  const problemEl = document.getElementById('session-complete-problem');
  if (problemEl && data.problem) problemEl.textContent = `"${data.problem}"`;
  if (overlay) overlay.classList.add('visible');

  document.getElementById('session-complete-read')?.addEventListener('click', () => {
    overlay?.classList.remove('visible');
  }, { once: true });

  document.getElementById('session-complete-export')?.addEventListener('click', () => {
    ws.send({ type: 'player:export' });
    overlay?.classList.remove('visible');
  }, { once: true });

  document.getElementById('session-complete-new')?.addEventListener('click', () => {
    overlay?.classList.remove('visible');
    stopGame();
    setupScreen.show();
  }, { once: true });
});

// Handle errors from server (Task 24)
// During gameplay: show an in-game toast. During setup: show in the form.
ws.on('error', (msg) => {
  const data = msg as unknown as ErrorMessage;
  if (gameStarted) {
    showToast(data.message, 'error');
  } else {
    setupScreen.showError(data.message);
  }
});

// Process errors (e.g. bad repo path, clone failure) — always during setup
ws.on('process:error', (msg) => {
  const data = msg as unknown as ErrorMessage;
  setupScreen.showError(data.message);
});

// Agent activity — surface agent errors as toasts during gameplay (Task 25)
ws.on('agent:activity', (msg) => {
  const data = msg as unknown as AgentActivityMessage;
  if (gameStarted && data.activity?.startsWith('Error:')) {
    showToast(`Agent error: ${data.activity.slice(7)}`, 'warn');
  }
});

// WebSocket reconnect banner (Task 25)
ws.on('ws:disconnected', () => {
  if (gameStarted) {
    document.getElementById('reconnect-banner')?.classList.add('visible');
  }
});
ws.on('ws:connected', () => {
  document.getElementById('reconnect-banner')?.classList.remove('visible');
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

// ── Server Info (LAN address for spectators) ──
let serverAddresses: string[] = [];
let serverPort = 3001;

// ── C1: localStorage helpers ──
function saveSessionIdentity(identity: SetupIdentity): void {
  try {
    localStorage.setItem('agentDungeon.identity', JSON.stringify({ name: identity.name, color: identity.color }));
  } catch { /* storage unavailable */ }
}

function getSavedIdentity(): SetupIdentity | null {
  try {
    const raw = localStorage.getItem('agentDungeon.identity');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === 'string' && typeof parsed.color === 'number') return parsed;
  } catch { /* ignore */ }
  return null;
}

function saveRealmId(realmId: string): void {
  try {
    localStorage.setItem('agentDungeon.realmId', realmId);
  } catch { /* storage unavailable */ }
}

ws.on('server:info', (msg) => {
  const data = msg as unknown as ServerInfoMessage;
  serverAddresses = data.addresses;
  serverPort = data.port;
  updateServerInfoPanel();

  // Persist activeRealmId whenever the server tells us one
  if (data.activeRealmId) {
    saveRealmId(data.activeRealmId);
  }

  // ── C3: Auto-resume on refresh ──
  // If the server is in playing mode and we have a saved identity for this realm, skip setup
  if (data.gamePhase === 'playing' && data.activeRealmId && !gameStarted) {
    const savedIdentity = getSavedIdentity();
    const savedRealmId = localStorage.getItem('agentDungeon.realmId');
    if (savedIdentity && savedRealmId === data.activeRealmId) {
      pendingIdentity = savedIdentity;
      startGame(savedIdentity);
    }
  }
});

function updateServerInfoPanel(): void {
  const el = document.getElementById('server-info');
  if (!el || serverAddresses.length === 0) return;
  const clientPort = 5173;
  const ip = serverAddresses[0];
  el.textContent = `Spectate: ${ip}:${clientPort}`;
  el.title = `Open http://${ip}:${clientPort} on any device on the same network to spectate`;
}

let phaserGame: Phaser.Game | null = null;
let promptBar: PromptBar | null = null;
let miniMap: MiniMap | null = null;
let questLog: QuestLog | null = null;
let stageProgressBar: StageProgressBar | null = null;
let agentRoster: AgentRoster | null = null;

// Spectator state
let mySpectatorId: string | null = null;
const connectedSpectators = new Map<string, SpectatorInfo>();

// ── Spectator Events ──

ws.on('spectator:welcome', (msg) => {
  const data = msg as unknown as SpectatorWelcomeMessage;
  mySpectatorId = data.spectator_id;
  // Full color arrives via spectator:joined broadcast — set partial identity for now
  promptBar?.setSpectator({ spectator_id: data.spectator_id, name: data.name, color: 0xc45a28 });
});

ws.on('spectator:joined', (msg) => {
  const data = msg as unknown as SpectatorJoinedMessage;
  connectedSpectators.set(data.spectator_id, { spectator_id: data.spectator_id, name: data.name, color: data.color });

  // If this is our own join, update PromptBar with full color info
  if (data.spectator_id === mySpectatorId) {
    promptBar?.setSpectator({ spectator_id: data.spectator_id, name: data.name, color: data.color });
  }

  updateSpectatorList();
});

ws.on('spectator:left', (msg) => {
  const data = msg as unknown as SpectatorLeftMessage;
  connectedSpectators.delete(data.spectator_id);
  updateSpectatorList();
});

ws.on('spectator:command', (msg) => {
  const data = msg as unknown as SpectatorCommandMessage;
  // Skip echo of own messages (shown locally immediately via onSpectatorMessage callback)
  if (data.spectator_id === mySpectatorId) return;
  window.dispatchEvent(new CustomEvent('spectator-command', {
    detail: { name: data.name, color: data.color, text: data.text, isOwn: false },
  }));
});

ws.on('world:state', (msg) => {
  const state = msg as unknown as WorldStateMessage;
  // Sync spectator list from world state (catches up after reconnect)
  if (state.spectators) {
    connectedSpectators.clear();
    for (const s of state.spectators) {
      connectedSpectators.set(s.spectator_id, s);
    }
    updateSpectatorList();
  }
});

function updateSpectatorList(): void {
  const listEl = document.getElementById('spectator-list');
  if (!listEl) return;

  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

  for (const info of connectedSpectators.values()) {
    const badge = document.createElement('div');
    badge.className = 'spectator-badge';

    const dot = document.createElement('span');
    dot.className = 'spectator-dot';
    dot.style.background = '#' + info.color.toString(16).padStart(6, '0');

    const label = document.createElement('span');
    label.textContent = info.name + (info.spectator_id === mySpectatorId ? ' (you)' : '');

    badge.appendChild(dot);
    badge.appendChild(label);
    listEl.appendChild(badge);
  }
}

// ── Start the Phaser game ──
function startGame(identity: SetupIdentity): void {
  if (gameStarted) return;
  gameStarted = true;

  // Hide all onboarding screens
  splashScreen.hide();
  setupScreen.hide();

  // Show game viewport
  const viewport = document.getElementById('game-viewport')!;
  viewport.style.display = 'flex';
  viewport.classList.remove('screen-hidden');

  // Launch Phaser and share the WebSocketClient + buffered messages via registry
  if (!phaserGame) {
    phaserGame = new Phaser.Game(gameConfig);
    phaserGame.registry.set('wsClient', ws);
    if (bufferedWorldState) {
      phaserGame.registry.set('bufferedWorldState', bufferedWorldState);
    }
    if (bufferedAgentJoins.length > 0) {
      phaserGame.registry.set('bufferedAgentJoins', [...bufferedAgentJoins]);
    }
    if (bufferedFogReveals.length > 0) {
      phaserGame.registry.set('bufferedFogReveals', [...bufferedFogReveals]);
    }
  }

  // Stage progress bar at top of sidebar
  if (stageProgressBar) stageProgressBar.destroy();
  stageProgressBar = new StageProgressBar('sidebar');

  // Agent roster (top-left overlay listing active agents)
  if (agentRoster) agentRoster.destroy();
  agentRoster = new AgentRoster((agent) => {
    window.dispatchEvent(new CustomEvent('agent-roster-click', { detail: agent }));
  });

  // Add spectator list panel to sidebar (before quest-log)
  if (!document.getElementById('spectator-panel')) {
    const spectatorPanel = document.createElement('div');
    spectatorPanel.id = 'spectator-panel';
    spectatorPanel.className = 'spectator-panel';

    const panelTitle = document.createElement('div');
    panelTitle.className = 'spectator-panel-title';
    panelTitle.textContent = 'Spectators';
    spectatorPanel.appendChild(panelTitle);

    const spectatorListEl = document.createElement('div');
    spectatorListEl.className = 'spectator-list';
    spectatorListEl.id = 'spectator-list';
    spectatorPanel.appendChild(spectatorListEl);

    const sidebar = document.getElementById('sidebar')!;
    const questLogEl = document.getElementById('quest-log')!;
    sidebar.insertBefore(spectatorPanel, questLogEl);
  }

  // Add server info panel (LAN address for spectators)
  if (!document.getElementById('server-info')) {
    const infoEl = document.createElement('div');
    infoEl.id = 'server-info';
    infoEl.className = 'server-info';
    const sidebar = document.getElementById('sidebar')!;
    const questLogEl = document.getElementById('quest-log')!;
    sidebar.insertBefore(infoEl, questLogEl);
    updateServerInfoPanel();
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
      // Dispatch event for DialogueLog to pick up (fallback when no spectator)
      window.dispatchEvent(
        new CustomEvent('prompt-player-message', { detail: { text } }),
      );
    },
    onSpectatorMessage: (name: string, color: number, text: string) => {
      // Show own message immediately with attribution before server echo
      window.dispatchEvent(new CustomEvent('spectator-command', {
        detail: { name, color, text, isOwn: true },
      }));
    },
  });

  // Auto-register as spectator using identity from SetupScreen
  ws.send({ type: 'spectator:register', name: identity.name, color: identity.color });

  // C1: Persist identity for auto-resume on refresh
  saveSessionIdentity(identity);

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

  // Dismiss overlays
  document.getElementById('session-complete-overlay')?.classList.remove('visible');
  document.getElementById('reconnect-banner')?.classList.remove('visible');

  // Hide game viewport
  const viewport = document.getElementById('game-viewport')!;
  viewport.style.display = 'none';
  viewport.classList.add('screen-hidden');

  // Destroy PromptBar
  if (promptBar) {
    promptBar.destroy();
    promptBar = null;
  }

  // Destroy stage progress bar
  if (stageProgressBar) {
    stageProgressBar.destroy();
    stageProgressBar = null;
  }

  // Remove spectator panel and server info
  const spectatorPanel = document.getElementById('spectator-panel');
  if (spectatorPanel) spectatorPanel.remove();
  const serverInfo = document.getElementById('server-info');
  if (serverInfo) serverInfo.remove();

  // Reset spectator state
  mySpectatorId = null;
  connectedSpectators.clear();
  pendingIdentity = null;

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
  setupScreen.show();
});
