import { WebSocketServer, WebSocket } from 'ws';
import type {
  ServerMessage,
  AgentRegisterMessage,
  LinkRepoMessage,
  StartProcessMessage,
  PlayerCommandMessage,
  UpdateSettingsMessage,
  DismissAgentMessage,
  GetAgentDetailsMessage,
  ListRealmsMessage,
  ResumeRealmMessage,
  RemoveRealmMessage,
  SessionSettings,
  RealmEntry,
  NavigationFrame,
  MapNode,
  MapNodeSummary,
  MapObject,
  ProcessState,
  SpectatorInfo,
  SpectatorRegisterMessage,
  SpectatorCommandMessage,
  FortClickMessage,
  FortViewMessage,
  FortUpdateMessage,
} from './types.js';
import { WorldState } from './WorldState.js';
import { RepoAnalyzer, type RepoData } from './RepoAnalyzer.js';
import { MapGenerator, type AgentMapResult } from './MapGenerator.js';
import { QuestManager } from './QuestManager.js';
import { AgentSessionManager } from './AgentSessionManager.js';
import { EventTranslator, type RPGEvent } from './EventTranslator.js';
import { CustomToolHandler } from './CustomToolHandler.js';
import { FindingsBoard } from './FindingsBoard.js';
import { LocalTreeReader, type LocalRepoData } from './LocalTreeReader.js';
import { TranscriptLogger } from './TranscriptLogger.js';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { RealmRegistry } from './RealmRegistry.js';
import { WorldStatePersistence } from './WorldStatePersistence.js';
import { GitHelper } from './GitHelper.js';
import { PROCESS_TEMPLATES, DEEP_BRAINSTORM, type ProcessDefinition, type StageDefinition } from './ProcessTemplates.js';
import { ProcessController, type ProcessControllerDelegate } from './ProcessController.js';
import { redisPubSub } from './RedisPubSub.js';

// Agent colors — auto-assigned in spawn order
const AGENT_COLORS = [
  0x6a8aff, // blue (oracle)
  0x5ae85a, // green
  0xe8c85a, // gold
  0xe85a5a, // red
  0xa85ae8, // purple
  0xe8985a, // orange
  0x5ae8e8, // cyan
  0xff69b4, // pink
];

export class BridgeServer {
  private wss: WebSocketServer;
  private port: number;
  private worldState: WorldState;
  private repoAnalyzer = new RepoAnalyzer();
  private mapGenerator = new MapGenerator();
  private questManager = new QuestManager();
  private sessionManager!: AgentSessionManager;
  private eventTranslator = new EventTranslator();
  private toolHandler!: CustomToolHandler;
  private findingsBoard!: FindingsBoard;
  private localTreeReader = new LocalTreeReader();
  private transcriptLogger: TranscriptLogger | null = null;
  private allSockets: Set<WebSocket> = new Set();
  private repoPath: string | null = null;
  private gamePhase: 'onboarding' | 'analyzing' | 'playing' = 'onboarding';
  private agentColorIndex = 0;
  private realmRegistry: RealmRegistry;
  private worldStatePersistence: WorldStatePersistence;
  private agentRoomPositions: Map<string, { x: number; y: number }> = new Map();
  private agentSockets = new Map<string, WebSocket>();           // agentId → socket
  private agentNavStacks = new Map<string, NavigationFrame[]>(); // agentId → nav stack
  private agentCurrentPath = new Map<string, string>();          // agentId → current folder path
  private playerSocket: WebSocket | null = null;
  private playerNavStack: NavigationFrame[] = [];
  private playerCurrentPath = '';
  private spectatorSockets = new Map<string, WebSocket>();        // spectatorId → socket
  private spectatorInfo = new Map<string, SpectatorInfo>();       // spectatorId → identity
  private processController: ProcessController | null = null;
  private activeRealmId: string | null = null;  // set on link-repo or start-process
  private saveTimer: NodeJS.Timeout | null = null;
  private movementBias: 'outward' | 'inward' | 'neutral' = 'neutral';
  private spawnParent = new Map<string, string>();       // childId → parentId
  private spawnChildren = new Map<string, Set<string>>(); // parentId → Set<childId>
  // ── Fog-of-War state ──
  private fogBiomeMap: number[][] | null = null;
  private agentFortAssignments: Map<string, { x: number; y: number }> = new Map();
  private movementIntervalId: ReturnType<typeof setInterval> | null = null;
  private agentFindingsCounts: Map<string, number> = new Map();
  private agentMovementTargets: Map<string, { x: number; y: number }> = new Map();
  private settings: SessionSettings = {
    max_agents: 5,
    token_budget_usd: 2.0,
    permission_level: 'read-only',
    autonomy_mode: 'supervised',
  };
  private settingsFilePath: string;

  constructor(port: number) {
    this.port = port;
    this.worldState = new WorldState();

    // Realm tracking — uses home directory for global registry
    const agentRpgHome = join(process.env.HOME ?? '/tmp', '.agent-rpg-global');
    this.realmRegistry = new RealmRegistry(agentRpgHome);
    this.worldStatePersistence = new WorldStatePersistence(agentRpgHome);
    this.settingsFilePath = join(agentRpgHome, '.agent-rpg', 'settings.json');

    // Load realm registry and persisted settings on startup
    this.realmRegistry.load().catch((err) => {
      console.error('[Bridge] Failed to load realm registry:', err);
    });
    this.loadSettings().catch((err) => {
      console.error('[Bridge] Failed to load settings:', err);
    });

    // Initialise Redis pub/sub (fire-and-forget — degrades gracefully if unavailable)
    redisPubSub.init().catch((err) => {
      console.error('[Bridge] RedisPubSub init error:', err);
    });

    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (ws) => this.handleConnection(ws));

    const lanAddresses = this.getLanAddresses();
    console.log(`Bridge server listening on ws://localhost:${port}`);
    if (lanAddresses.length > 0) {
      console.log(`  LAN: ${lanAddresses.map(ip => `ws://${ip}:${port}`).join(', ')}`);
    }
  }

  /** Returns IPv4 LAN addresses (non-loopback). */
  private getLanAddresses(): string[] {
    const nets = networkInterfaces();
    const results: string[] = [];
    for (const entries of Object.values(nets)) {
      if (!entries) continue;
      for (const entry of entries) {
        if (entry.family === 'IPv4' && !entry.internal) {
          results.push(entry.address);
        }
      }
    }
    return results;
  }

  // ── Connection Handling ──

  private handleConnection(ws: WebSocket): void {
    this.allSockets.add(ws);

    // Send server network info so clients can display spectator URL
    this.send(ws, {
      type: 'server:info',
      addresses: this.getLanAddresses(),
      port: this.port,
      gamePhase: this.gamePhase,
      activeRealmId: this.activeRealmId ?? null,
    });

    // Send current world state if in gameplay phase
    if (this.gamePhase === 'playing') {
      this.send(ws, this.buildWorldStateMessage());
    }

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        this.send(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }
      try {
        this.handleMessage(ws, msg);
      } catch (err) {
        console.error('[Bridge] Error handling message:', err);
        this.send(ws, { type: 'error', message: 'Internal server error' });
      }
    });

    ws.on('close', () => {
      this.allSockets.delete(ws);

      // Clean up spectator if this was a spectator socket
      for (const [id, socket] of this.spectatorSockets.entries()) {
        if (socket === ws) {
          this.spectatorSockets.delete(id);
          this.spectatorInfo.delete(id);
          this.broadcast({ type: 'spectator:left', spectator_id: id });
          console.log(`[Bridge] Spectator disconnected: ${id}`);
          break;
        }
      }
    });
  }

  // ── Message Router ──

  private handleMessage(ws: WebSocket, msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'agent:register':
        this.handleAgentRegister(ws, msg as unknown as AgentRegisterMessage);
        break;
      case 'player:link-repo':
        this.handleLinkRepo(ws, msg as unknown as LinkRepoMessage);
        break;
      case 'player:start-process':
        this.handleStartProcess(ws, msg as unknown as StartProcessMessage);
        break;
      case 'player:command':
        this.handlePlayerCommand(ws, msg as unknown as PlayerCommandMessage);
        break;
      case 'player:update-settings':
        this.handleUpdateSettings(ws, msg as unknown as UpdateSettingsMessage);
        break;
      case 'player:dismiss-agent':
        this.handleDismissAgent(ws, msg as unknown as DismissAgentMessage);
        break;
      case 'player:get-agent-details':
        void this.handleGetAgentDetails(ws, msg as unknown as GetAgentDetailsMessage);
        break;
      case 'player:list-realms':
        this.handleListRealms(ws);
        break;
      case 'player:resume-realm':
        this.handleResumeRealm(ws, msg as unknown as ResumeRealmMessage);
        break;
      case 'player:remove-realm':
        this.handleRemoveRealm(ws, msg as unknown as RemoveRealmMessage);
        break;
      case 'player:navigate-enter':
        this.handlePlayerNavigateEnter(ws, (msg as any).target_path as string);
        break;
      case 'player:navigate-back':
        this.handlePlayerNavigateBack(ws);
        break;
      case 'spectator:register':
        this.handleSpectatorRegister(ws, msg as unknown as SpectatorRegisterMessage);
        break;
      case 'spectator:command':
        this.handleSpectatorCommand(ws, msg as unknown as SpectatorCommandMessage);
        break;
      case 'fort:click':
        this.handleFortClick(msg as unknown as FortClickMessage, ws);
        break;
      case 'fort:exit':
        this.handleFortExit(ws);
        break;
      default:
        this.send(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  }

  // ── External Agent Registration ──

  private handleAgentRegister(ws: WebSocket, msg: AgentRegisterMessage): void {
    const { agent_id, name, color } = msg;

    // Use the provided color or auto-assign one
    const agentColor = color ?? this.nextColor();
    const agent = this.worldState.addAgent(agent_id, name, agentColor, 'External', '/');

    this.agentSockets.set(agent_id, ws);
    this.agentNavStacks.set(agent_id, []);
    this.agentCurrentPath.set(agent_id, '');

    this.broadcast({ type: 'agent:joined', agent });
    this.broadcast(this.buildWorldStateMessage());

    // Track socket so we can detect disconnect
    ws.on('close', () => {
      this.worldState.removeAgent(agent_id);
      this.agentSockets.delete(agent_id);
      this.agentNavStacks.delete(agent_id);
      this.agentCurrentPath.delete(agent_id);
      this.broadcast({ type: 'agent:left', agent_id });
      console.log(`[Bridge] External agent disconnected: ${agent_id} (${name})`);
    });

    console.log(`[Bridge] External agent registered: ${agent_id} (${name})`);
  }

  // ── Agent Details ──

  private async handleGetAgentDetails(ws: WebSocket, msg: GetAgentDetailsMessage): Promise<void> {
    const agentId = msg.agent_id;
    const agentInfo = this.worldState.agents.get(agentId);
    if (!agentInfo) {
      return; // agent not found, silently ignore
    }

    const vault = this.sessionManager?.getVault(agentId);
    const knowledge = vault ? vault.getKnowledge() : null;

    const allFindings = await this.findingsBoard?.getAll() ?? [];
    const agentFindings = allFindings.filter((f) => f.agent_id === agentId);

    // Read and categorize transcript entries
    const thoughts: Array<{ text: string; timestamp: string }> = [];
    const actions: Array<{ tool: string; input: string; timestamp: string }> = [];

    if (this.transcriptLogger) {
      const entries = await this.transcriptLogger.readTranscript(agentId);
      for (const entry of entries) {
        const raw = entry.message as any;
        if (!raw || typeof raw !== 'object') continue;

        if (raw.type === 'assistant' && Array.isArray(raw.message?.content)) {
          for (const block of raw.message.content) {
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              thoughts.push({ text: block.text.trim(), timestamp: entry.timestamp });
            } else if (block.type === 'tool_use') {
              actions.push({
                tool: block.name ?? 'unknown',
                input: typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
                timestamp: entry.timestamp,
              });
            }
          }
        }
      }
    }

    // Derive tool list from agent's MCP server type
    const session = this.sessionManager?.getSession(agentId);
    const hasBrainstormTools = session?.config.processContext != null;
    const tools = session
      ? (hasBrainstormTools
        ? ['PostFindings', 'UpdateKnowledge', 'CompleteStage']
        : ['SummonAgent', 'RequestHelp', 'PostFindings', 'UpdateKnowledge', 'ClaimQuest', 'CompleteQuest'])
      : [];

    this.send(ws, {
      type: 'agent:details',
      agent_id: agentId,
      info: agentInfo,
      knowledge: knowledge ? {
        expertise: knowledge.expertise,
        insights: knowledge.insights,
        task_history: knowledge.task_history,
      } : { expertise: {}, insights: [], task_history: [] },
      findings: agentFindings.map((f) => ({
        id: f.id,
        finding: f.finding,
        severity: f.severity,
        timestamp: f.timestamp,
      })),
      transcript: {
        thoughts: thoughts.slice(-50),
        actions: actions.slice(-50),
      },
      tools,
    });
  }

  /**
   * Build the ProcessControllerDelegate that bridges ProcessController
   * back to BridgeServer's subsystems.
   */
  private createProcessDelegate(): ProcessControllerDelegate {
    return {
      dismissStageAgents: async (stage: StageDefinition) => {
        for (const roleId of stage.roles) {
          // In fog mode: upgrade fort to stage 5 (completed) before removing agent
          if (this.fogBiomeMap) {
            this.updateFortStage(roleId, 5);
            this.agentMovementTargets.delete(roleId);
          }
          await this.sessionManager.dismissAgent(roleId);
          this.worldState.removeAgent(roleId);
          this.broadcast({ type: 'agent:left', agent_id: roleId });
        }
        this.scheduleSave();
      },
      spawnStageAgents: async (tpl: ProcessDefinition, idx: number, prob: string) => {
        await this.spawnProcessAgents(tpl, idx, prob);
        this.scheduleSave();
      },
      broadcast: (msg) => this.broadcast(msg as unknown as ServerMessage),
      saveArtifact: (stageId, artifactId, content) => {
        this.worldState.setArtifact(stageId, artifactId, content);
        this.scheduleSave();
      },
      onStageAdvanced: (completedStageId, artifacts) => {
        this.worldState.advanceStage(completedStageId, artifacts);
        this.scheduleSave();
      },
      onProcessCompleted: (finalStageId, artifacts) => {
        this.worldState.completeProcess(finalStageId, artifacts);
        this.scheduleSave();
      },
      sendFollowUp: async (agentId, prompt) => {
        await this.sessionManager.sendFollowUp(agentId, prompt);
      },
    };
  }

  /** Wire movement-bias listener onto a ProcessController. */
  private wireProcessControllerEvents(pc: ProcessController): void {
    pc.on('stage:started', (event: any) => {
      const stageId: string = event.stageId ?? '';
      const divergent = ['divergent_thinking', 'precedent_research'];
      const convergent = ['convergent_thinking', 'fact_checking', 'pushback'];
      if (divergent.some(s => stageId.includes(s))) {
        this.movementBias = 'outward';
      } else if (convergent.some(s => stageId.includes(s))) {
        this.movementBias = 'inward';
      } else {
        this.movementBias = 'neutral';
      }
    });
  }

  // ── Brainstorming Process ──

  private async handleStartProcess(ws: WebSocket, msg: StartProcessMessage): Promise<void> {
    try {
      this.gamePhase = 'analyzing';
      await this.cleanupCurrentRealm();

      const template = PROCESS_TEMPLATES[msg.processId ?? DEEP_BRAINSTORM.id] ?? DEEP_BRAINSTORM;
      const firstStage = template.stages[0];

      const processState: ProcessState = {
        processId: template.id,
        problem: msg.problem,
        currentStageIndex: 0,
        status: 'running',
        collectedArtifacts: {},
        startedAt: new Date().toISOString(),
      };

      // Use a stable working dir for persistence (same pattern as repo flow)
      const workDir = process.env.HOME ?? '/tmp';
      this.repoPath = workDir;
      this.activeRealmId = `brainstorm_${Date.now()}`;
      this.realmRegistry.setLastActiveRealmId(this.activeRealmId);
      await this.realmRegistry.save();

      // Fresh world state with process
      this.worldState = new WorldState();
      this.worldState.setProcessState(processState);

      // Generate fog-of-war overworld (120×120) with forts for all agents across all stages
      const allRoleIds = [...new Set(template.stages.flatMap(s => s.roles))];
      const fogResult = this.mapGenerator.generateFogMap(allRoleIds);
      this.worldState.setMap(fogResult.map);
      this.worldState.initFogMap(fogResult.map.width, fogResult.map.height);
      this.fogBiomeMap = fogResult.biomeMap;
      this.agentFortAssignments = fogResult.fortPositions;
      // Set fort positions on worldState so updateFortStage can broadcast them
      for (const [id, pos] of fogResult.fortPositions) {
        this.worldState.setFortPosition(id, pos.x, pos.y);
      }
      // Reveal tiles around the Oracle center
      const oracleRevealed = this.worldState.revealTiles(60, 60, 8);
      if (oracleRevealed.length > 0) {
        this.broadcast({ type: 'fog:reveal', tiles: oracleRevealed, agentId: 'oracle' } as ServerMessage);
      }

      // Minimal infrastructure (no findings board / transcript logger yet for process flow)
      this.findingsBoard = new FindingsBoard(workDir);
      await this.findingsBoard.load();
      this.transcriptLogger = new TranscriptLogger(workDir);
      this.toolHandler = new CustomToolHandler(
        this.findingsBoard,
        this.questManager,
        (agentId: string) => this.sessionManager.getVault(agentId),
        (agentId: string) => {
          const session = this.sessionManager.getSession(agentId);
          return session?.config.agentName ?? agentId;
        },
      );
      this.wireToolHandlerEvents();
      this.sessionManager = new AgentSessionManager(this.findingsBoard, this.toolHandler);
      this.wireSessionManagerEvents();
      this.eventTranslator.setObjects([]);

      // Broadcast process started
      this.broadcast({
        type: 'process:started',
        processId: template.id,
        problem: msg.problem,
        processName: template.name,
        currentStageId: firstStage.id,
        currentStageName: firstStage.name,
        totalStages: template.stages.length,
      });

      this.gamePhase = 'playing';

      // Create process controller with delegate callbacks
      this.processController = new ProcessController(this.createProcessDelegate());
      this.wireProcessControllerEvents(this.processController);

      // Spawn the first stage's agents
      await this.spawnProcessAgents(template, 0, msg.problem);

      // Start stage tracking after agents are spawned
      this.processController.start(msg.problem, template);

      console.log(`[Bridge] Process started: "${msg.problem}" (template: ${template.id})`);
    } catch (err) {
      this.gamePhase = 'onboarding';
      const message = err instanceof Error ? err.message : 'Failed to start process';
      this.send(ws, { type: 'error', message });
    }
  }

  private async spawnProcessAgents(
    template: ProcessDefinition,
    stageIndex: number,
    problem: string,
    options?: { resumed?: boolean },
  ): Promise<void> {
    const stage = template.stages[stageIndex];
    if (!stage) return;

    const agentEntries = stage.roles.map((roleId) => {
      const roleDef = template.roles.find((r) => r.id === roleId)!;
      return { agentId: roleId, name: roleDef.name, role: roleDef.name };
    });

    const isFogMode = this.fogBiomeMap !== null;

    if (!isFogMode) {
      // Legacy room-based map generation (non-fog mode)
      const result = this.mapGenerator.generateProcessStageMap(template, stageIndex);
      this.worldState.setMap(result.map);
      this.worldState.setObjects(result.objects);
      this.eventTranslator.setObjects(result.objects);

      for (const entry of agentEntries) {
        const color = this.nextColor();
        const pos = result.agentPositions[entry.agentId];
        this.agentRoomPositions.set(entry.agentId, pos);
        const agent = this.worldState.addAgent(entry.agentId, entry.name, color, entry.role, '/', pos);
        this.broadcast({ type: 'agent:joined', agent });
      }
    } else {
      // Fog-of-war mode: spawn agents at Oracle center (60,60), assign fort targets
      this.eventTranslator.setObjects([]);
      const ORACLE_X = 60, ORACLE_Y = 60;

      for (const entry of agentEntries) {
        const color = this.nextColor();
        const pos = { x: ORACLE_X, y: ORACLE_Y };
        this.agentRoomPositions.set(entry.agentId, pos);
        const agent = this.worldState.addAgent(entry.agentId, entry.name, color, entry.role, '/', pos);
        this.broadcast({ type: 'agent:joined', agent });

        // Set initial fort stage (campfire) and assign movement target toward fort
        this.updateFortStage(entry.agentId, 1);
        const fortPos = this.agentFortAssignments.get(entry.agentId);
        if (fortPos) {
          this.agentMovementTargets.set(entry.agentId, fortPos);
        }
      }

      // Start autonomous movement if not already running
      this.startAutonomousMovement();
    }

    this.broadcast(this.buildWorldStateMessage());

    const priorArtifacts = this.worldState.getProcessState()?.collectedArtifacts ?? {};

    for (const entry of agentEntries) {
      const roleDef = template.roles.find((r) => r.id === entry.agentId)!;
      await this.sessionManager.spawnAgent({
        agentId: entry.agentId,
        agentName: entry.name,
        role: entry.role,
        realm: '/',
        mission: `Participate in the "${stage.name}" stage of the brainstorming session. Use PostFindings to share ideas with the group.`,
        repoPath: this.repoPath ?? process.env.HOME ?? '/tmp',
        permissionLevel: this.settings.permission_level,
        processContext: {
          problem,
          processName: template.name,
          stageId: stage.id,
          stageName: stage.name,
          stageGoal: stage.goal,
          stageIndex,
          totalStages: template.stages.length,
          persona: roleDef.persona,
          priorArtifacts,
          ...(options?.resumed ? {
            resumeNote: 'You are resuming a paused brainstorm session. Prior stage artifacts are available in your system prompt. Continue where the previous agents left off.',
          } : {}),
        },
      });
    }
  }

  // ── Repo Analysis ──

  private async handleLinkRepo(ws: WebSocket, msg: LinkRepoMessage): Promise<void> {
    try {
      this.gamePhase = 'analyzing';
      // Clean up any existing sessions from a previous realm
      await this.cleanupCurrentRealm();
      const input = msg.repo_url.trim();

      let repoData: RepoData;
      let localRepoPath: string;

      // Detect local path vs GitHub URL
      if (input.startsWith('/') || input.startsWith('~') || input.startsWith('.')) {
        // Local path
        const resolvedPath = input.startsWith('~')
          ? input.replace('~', process.env.HOME ?? '')
          : input;

        const localData: LocalRepoData = await this.localTreeReader.analyze(resolvedPath);
        localRepoPath = resolvedPath;

        // Convert LocalRepoData to RepoData shape for MapGenerator compatibility
        repoData = {
          owner: 'local',
          repo: localData.repoName,
          tree: localData.tree,
          issues: [], // no GitHub issues for local repos
          languages: localData.languages,
          totalFiles: localData.totalFiles,
          defaultBranch: 'main',
        };
      } else {
        // GitHub URL — use existing RepoAnalyzer
        repoData = await this.repoAnalyzer.analyze(input);
        // TODO: clone to temp dir for actual agent work
        localRepoPath = `/tmp/agent-rpg-repos/${repoData.owner}/${repoData.repo}`;
        console.log(`[Bridge] Note: GitHub URL support needs git clone for agent work. Path: ${localRepoPath}`);
      }

      this.repoPath = localRepoPath;

      // Extract quests from repo analysis (map is generated when oracle spawns)
      const { quests } = this.mapGenerator.generate(repoData);

      // Build hierarchical map tree for folder navigation
      const mapTree = this.mapGenerator.buildMapTree(repoData.tree);

      // Reset world state (map/objects will be set in spawnOracle)
      this.worldState = new WorldState();
      this.worldState.setMapTree(mapTree);
      this.worldState.setQuests(quests);

      // Load quests
      this.questManager.loadQuests(quests);

      // Initialize findings board
      this.findingsBoard = new FindingsBoard(localRepoPath);
      await this.findingsBoard.load();

      // Initialize transcript logger
      this.transcriptLogger = new TranscriptLogger(localRepoPath);

      // Initialize custom tool handler FIRST (before session manager)
      this.toolHandler = new CustomToolHandler(
        this.findingsBoard,
        this.questManager,
        (agentId: string) => this.sessionManager.getVault(agentId),
        (agentId: string) => {
          const session = this.sessionManager.getSession(agentId);
          return session?.config.agentName ?? agentId;
        },
      );
      this.wireToolHandlerEvents();

      // Initialize session manager SECOND (needs toolHandler)
      this.sessionManager = new AgentSessionManager(this.findingsBoard, this.toolHandler);
      this.wireSessionManagerEvents();

      // Event translator will be updated with agent-room objects after oracle spawns
      this.eventTranslator.setObjects([]);

      // Broadcast repo:ready with default map (real agent map comes after oracle spawns)
      this.broadcast({
        type: 'repo:ready',
        repo_name: repoData.owner === 'local'
          ? repoData.repo
          : `${repoData.owner}/${repoData.repo}`,
        map: this.worldState.map,
        quests,
        objects: [],
        stats: {
          total_files: repoData.totalFiles,
          total_lines: 0,
          languages: repoData.languages,
          open_issues: repoData.issues.length,
          last_commit: '',
        },
      });

      // Save realm to registry
      const realmId = this.realmRegistry.generateRealmId(localRepoPath);
      this.activeRealmId = realmId;
      this.realmRegistry.setLastActiveRealmId(realmId);
      let gitInfo = { lastCommitSha: '', branch: 'main', remoteUrl: null as string | null };
      try {
        gitInfo = await GitHelper.getGitInfo(localRepoPath);
      } catch {
        // Not a git repo — use defaults
      }

      const realmEntry: RealmEntry = {
        id: realmId,
        path: localRepoPath,
        name: repoData.repo,
        displayName: repoData.owner === 'local'
          ? repoData.repo
          : `${repoData.owner}/${repoData.repo}`,
        lastExplored: new Date().toISOString(),
        gitInfo,
        stats: {
          totalFiles: repoData.totalFiles,
          languages: Object.keys(repoData.languages),
          agentsUsed: 1,
          findingsCount: 0,
          questsTotal: quests.length,
          questsCompleted: 0,
        },
        mapSnapshot: {
          rooms: 1,
          tileWidth: 60,
          tileHeight: 50,
        },
      };

      this.realmRegistry.saveRealm(realmEntry);
      await this.realmRegistry.save();

      // Persist world state for resume
      await this.worldStatePersistence.save(realmId, this.worldState);

      this.gamePhase = 'playing';

      // Auto-spawn oracle agent
      await this.spawnOracle(localRepoPath);

      console.log(
        `[Bridge] Repo ready: ${repoData.repo} (${repoData.totalFiles} files, ${quests.length} quests)`,
      );
    } catch (err) {
      this.gamePhase = 'onboarding';
      const message = err instanceof Error ? err.message : 'Failed to analyze repo';
      this.send(ws, { type: 'error', message });
    }
  }

  // ── Oracle Spawn ──

  private async spawnOracle(repoPath: string): Promise<void> {
    const agentId = 'oracle';
    const agentName = 'The Oracle';
    const role = 'Oracle';
    const realm = '/';
    const color = this.nextColor();

    // Generate the single-room agent map for oracle
    const result = this.mapGenerator.generateAgentMap([{ agentId, name: agentName, role }]);
    this.worldState.setMap(result.map);
    this.worldState.setObjects(result.objects);
    this.eventTranslator.setObjects(result.objects);
    this.agentRoomPositions.set(agentId, result.agentPositions[agentId]);

    const agent = this.worldState.addAgent(agentId, agentName, color, role, realm,
      result.agentPositions[agentId]);
    this.broadcast({ type: 'agent:joined', agent });
    this.broadcast(this.buildWorldStateMessage());

    await this.sessionManager.spawnAgent({
      agentId,
      agentName,
      role,
      realm,
      mission: `You are the first agent to explore this codebase. Your mission:
1. Explore the repository structure — read key files, understand the architecture.
2. Identify the main technologies, frameworks, and patterns used.
3. Assess code quality, test coverage, and areas that need attention.
4. Share your findings with the team using PostFindings.
5. When you identify areas that need specialized attention, use SummonAgent to request specialists.
6. Save your key insights using UpdateKnowledge.

Start by reading the top-level files (README, package.json, etc.) then explore the main source directories.`,
      repoPath,
      permissionLevel: this.settings.permission_level,
    });

    console.log(`[Bridge] Oracle spawned for ${repoPath}`);
  }

  // ── Agent Spawning (from SummonAgent requests) ──

  private async spawnRequestedAgent(request: {
    requestingAgent: string;
    name: string;
    role: string;
    realm: string;
    mission: string;
    priority: string;
  }): Promise<string | null> {
    if (!this.repoPath) return null;

    const activeCount = this.sessionManager.getActiveAgentIds().length;
    if (activeCount >= this.settings.max_agents) {
      console.log(`[Bridge] Spawn denied: max agents (${this.settings.max_agents}) reached`);
      // Notify the requesting agent
      this.broadcast({
        type: 'agent:activity',
        agent_id: request.requestingAgent,
        activity: `Spawn request denied: max agents (${this.settings.max_agents}) reached`,
      });
      return null;
    }

    // Generate a safe agent ID
    const agentId = request.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 30)
      || `agent_${Date.now()}`;

    // Check if already exists
    if (this.sessionManager.getActiveAgentIds().includes(agentId)) {
      console.log(`[Bridge] Spawn denied: agent "${agentId}" already active`);
      return null;
    }

    const color = this.nextColor();
    const agent = this.worldState.addAgent(
      agentId,
      request.name,
      color,
      request.role,
      request.realm,
    );

    // Rebuild full map with all agents and move new agent to its room
    const result = this.rebuildAgentMap();
    const pos = result.agentPositions[agentId];
    if (pos) this.worldState.applyMove(agentId, pos.x, pos.y);

    this.broadcast({ type: 'agent:joined', agent });
    this.broadcast(this.buildWorldStateMessage());

    // Notify client of spawn request (for UI)
    this.broadcast({
      type: 'agent:spawn-request',
      requesting_agent_id: request.requestingAgent,
      requested_name: request.name,
      requested_role: request.role,
      requested_realm: request.realm,
      requested_mission: request.mission,
      priority: request.priority as 'low' | 'medium' | 'high',
    });

    await this.sessionManager.spawnAgent({
      agentId,
      agentName: request.name,
      role: request.role,
      realm: request.realm,
      mission: request.mission,
      repoPath: this.repoPath,
      permissionLevel: this.settings.permission_level,
    });

    console.log(`[Bridge] Agent spawned: ${agentId} (${request.name}, realm: ${request.realm})`);
    return agentId;
  }

  // ── Player Commands ──

  private handlePlayerCommand(_ws: WebSocket, msg: PlayerCommandMessage): void {
    if (!this.sessionManager) return;

    console.log(`[Bridge] Player command: ${msg.text}`);

    // Try to route to a specific agent by prefix: "Oracle, do X" or "engineer, fix Y"
    const activeIds = this.sessionManager.getActiveAgentIds();
    let targetId = 'oracle'; // default to oracle

    for (const id of activeIds) {
      const session = this.sessionManager.getSession(id);
      if (!session) continue;
      const name = session.config.agentName.toLowerCase();
      if (msg.text.toLowerCase().startsWith(name + ',') ||
          msg.text.toLowerCase().startsWith(name + ' ')) {
        targetId = id;
        break;
      }
    }

    // Wrap with player context so the agent treats this as a human directive
    const prompt = `[PLAYER COMMAND]: ${msg.text}`;

    // If the target agent is busy, let the player know their command is queued
    const session = this.sessionManager.getSession(targetId);
    const willQueue = !session?.sessionId ||
      session.status === 'starting' ||
      session.status === 'running';

    if (willQueue) {
      this.broadcast({
        type: 'agent:activity',
        agent_id: targetId,
        activity: 'Busy — your command is queued and will be delivered when ready',
      });
    }

    // Send follow-up to the target agent
    this.sessionManager.sendFollowUp(targetId, prompt).catch((err) => {
      console.error(`[Bridge] Failed to send command to ${targetId}:`, err);
    });
  }

  // ── Spectator Registration ──

  private handleSpectatorRegister(ws: WebSocket, msg: SpectatorRegisterMessage): void {
    // Reject re-registration on same socket
    for (const [id, socket] of this.spectatorSockets.entries()) {
      if (socket === ws) {
        this.send(ws, { type: 'spectator:welcome', spectator_id: id, name: this.spectatorInfo.get(id)?.name ?? msg.name });
        return;
      }
    }

    const spectator_id = `spectator_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const info: SpectatorInfo = { spectator_id, name: msg.name.slice(0, 30), color: msg.color };

    this.spectatorSockets.set(spectator_id, ws);
    this.spectatorInfo.set(spectator_id, info);

    // Welcome the spectator (private)
    this.send(ws, { type: 'spectator:welcome', spectator_id, name: info.name });

    // Notify all clients of new spectator
    this.broadcast({ type: 'spectator:joined', spectator_id, name: info.name, color: info.color });

    // Send current world state with spectators list
    if (this.gamePhase === 'playing') {
      this.send(ws, this.buildWorldStateMessage());
    }

    console.log(`[Bridge] Spectator registered: ${spectator_id} (${info.name})`);
  }

  // ── Spectator Commands ──

  private handleSpectatorCommand(_ws: WebSocket, msg: SpectatorCommandMessage): void {
    if (!this.sessionManager) return;

    console.log(`[Bridge] Spectator command from ${msg.name}: ${msg.text}`);

    // Echo to all clients for attribution display
    this.broadcast(msg as unknown as ServerMessage);

    // Route to agent (same logic as player:command)
    const activeIds = this.sessionManager.getActiveAgentIds();
    let targetId = 'oracle';

    for (const id of activeIds) {
      const session = this.sessionManager.getSession(id);
      if (!session) continue;
      const name = session.config.agentName.toLowerCase();
      if (msg.text.toLowerCase().startsWith(name + ',') ||
          msg.text.toLowerCase().startsWith(name + ' ')) {
        targetId = id;
        break;
      }
    }

    const prompt = `[PLAYER COMMAND from ${msg.name}]: ${msg.text}`;

    this.sessionManager.sendFollowUp(targetId, prompt).catch((err) => {
      console.error(`[Bridge] Failed to send spectator command to ${targetId}:`, err);
    });
  }

  // ── Settings ──

  private handleUpdateSettings(_ws: WebSocket, msg: UpdateSettingsMessage): void {
    this.settings = { ...this.settings, ...msg.settings };
    console.log('[Bridge] Settings updated:', this.settings);
    this.saveSettings().catch((err) => {
      console.error('[Bridge] Failed to persist settings:', err);
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      const raw = await readFile(this.settingsFilePath, 'utf-8');
      const saved = JSON.parse(raw) as Partial<SessionSettings>;
      this.settings = { ...this.settings, ...saved };
      console.log('[Bridge] Settings loaded from disk:', this.settings);
    } catch {
      // File not found or parse error — use defaults
    }
  }

  private async saveSettings(): Promise<void> {
    await mkdir(join(this.settingsFilePath, '..'), { recursive: true });
    await writeFile(this.settingsFilePath, JSON.stringify(this.settings, null, 2), 'utf-8');
  }

  // ── Agent Dismissal ──

  private async handleDismissAgent(_ws: WebSocket, msg: DismissAgentMessage): Promise<void> {
    if (!this.sessionManager) return;

    await this.sessionManager.dismissAgent(msg.agent_id);
    this.worldState.removeAgent(msg.agent_id);
    this.agentSockets.delete(msg.agent_id);
    this.agentNavStacks.delete(msg.agent_id);
    this.agentCurrentPath.delete(msg.agent_id);
    this.broadcast({ type: 'agent:left', agent_id: msg.agent_id });

    console.log(`[Bridge] Agent dismissed: ${msg.agent_id}`);
  }

  // ── Realm Tracking ──

  private async handleListRealms(ws: WebSocket): Promise<void> {
    const realms = this.realmRegistry.listRealms();
    const realmsWithChanges = await Promise.all(
      realms.map(async (realm) => {
        let changesSinceLastScan: number | null = null;
        try {
          if (realm.gitInfo.lastCommitSha) {
            changesSinceLastScan = await GitHelper.countCommitsSince(
              realm.path,
              realm.gitInfo.lastCommitSha,
            );
          }
        } catch {
          // Repo may no longer exist or not be a git repo
        }
        return { ...realm, changesSinceLastScan };
      }),
    );

    this.send(ws, { type: 'realm:list', realms: realmsWithChanges });
  }

  private async handleResumeRealm(ws: WebSocket, msg: ResumeRealmMessage): Promise<void> {
    try {
      const realm = this.realmRegistry.getRealm(msg.realm_id);
      if (!realm) {
        this.send(ws, { type: 'error', message: `Realm "${msg.realm_id}" not found` });
        return;
      }

      this.gamePhase = 'analyzing';

      // Clean up existing sessions if any
      await this.cleanupCurrentRealm();

      // Load saved world state
      const savedState = await this.worldStatePersistence.load(msg.realm_id);
      if (!savedState) {
        this.send(ws, { type: 'error', message: 'No saved state for this realm. Try re-scanning.' });
        this.gamePhase = 'onboarding';
        return;
      }

      this.repoPath = realm.path;
      this.worldState = savedState;

      // Restore navigation state if present (populated by S3's save triggers)
      const navState = this.worldState.navigationState;
      if (navState) {
        for (const [agentId, stack] of Object.entries(navState.agentNavStacks)) {
          this.agentNavStacks.set(agentId, stack);
        }
        for (const [agentId, path] of Object.entries(navState.agentCurrentPath)) {
          this.agentCurrentPath.set(agentId, path);
        }
      }

      // Reload quests
      this.questManager.loadQuests(savedState.getQuests());

      // Initialize findings board
      this.findingsBoard = new FindingsBoard(realm.path);
      await this.findingsBoard.load();

      // Initialize transcript logger
      this.transcriptLogger = new TranscriptLogger(realm.path);

      // Initialize custom tool handler FIRST (before session manager)
      this.toolHandler = new CustomToolHandler(
        this.findingsBoard,
        this.questManager,
        (agentId: string) => this.sessionManager.getVault(agentId),
        (agentId: string) => {
          const session = this.sessionManager.getSession(agentId);
          return session?.config.agentName ?? agentId;
        },
      );
      this.wireToolHandlerEvents();

      // Initialize session manager SECOND (needs toolHandler)
      this.sessionManager = new AgentSessionManager(this.findingsBoard, this.toolHandler);
      this.wireSessionManagerEvents();

      // Set objects on event translator
      this.eventTranslator.setObjects(savedState.getObjects());

      // Update lastExplored timestamp
      realm.lastExplored = new Date().toISOString();
      this.activeRealmId = realm.id;
      this.realmRegistry.setLastActiveRealmId(realm.id);
      this.realmRegistry.saveRealm(realm);
      await this.realmRegistry.save();

      // Broadcast repo:ready with saved state
      this.broadcast({
        type: 'repo:ready',
        repo_name: realm.displayName,
        map: savedState.map,
        quests: savedState.getQuests(),
        objects: savedState.getObjects(),
        stats: {
          total_files: realm.stats.totalFiles,
          total_lines: 0,
          languages: realm.stats.languages.reduce(
            (acc, lang) => ({ ...acc, [lang]: 1 }),
            {} as Record<string, number>,
          ),
          open_issues: realm.stats.questsTotal - realm.stats.questsCompleted,
          last_commit: realm.gitInfo.lastCommitSha,
        },
      });

      if (this.worldState.mapTree) {
        this.broadcast({
          type: 'realm:tree',
          root: this.stripMapData(this.worldState.mapTree),
        });
      }

      this.gamePhase = 'playing';

      // ── S5: Process-aware resume ──────────────────────────────────────────
      const processState = this.worldState.getProcessState();
      if (processState && processState.status === 'running') {
        const template = PROCESS_TEMPLATES[processState.processId];
        if (template) {
          // Restore active realm ID so scheduleSave() keeps writing
          this.activeRealmId = msg.realm_id;

          // Reconstruct ProcessController from saved turn counts (no start() — would reset counts)
          this.processController = ProcessController.fromJSON(
            processState,
            template,
            this.createProcessDelegate(),
          );
          this.wireProcessControllerEvents(this.processController);

          const currentStage = template.stages[processState.currentStageIndex];
          const problem = processState.problemStatement ?? processState.problem;

          // Tell the client a process is resuming so it enters game mode
          this.broadcast({
            type: 'process:started',
            processId: template.id,
            processName: template.name,
            problem,
            currentStageId: currentStage?.id ?? '',
            currentStageName: currentStage?.name ?? '',
            totalStages: template.stages.length,
          });

          // Respawn agents for the current stage with resume context
          await this.spawnProcessAgents(
            template,
            processState.currentStageIndex,
            problem,
            { resumed: true },
          );

          console.log(`[Bridge] Process resumed: "${problem}" at stage "${currentStage?.name}" (${processState.currentStageIndex + 1}/${template.stages.length})`);
        } else {
          console.warn(`[Bridge] Template "${processState.processId}" not found, falling back to Oracle`);
          await this.spawnOracle(realm.path);
          console.log(`[Bridge] Realm resumed (Oracle fallback): ${realm.displayName}`);
        }
      } else {
        // No running process — spawn Oracle as usual
        await this.spawnOracle(realm.path);
        console.log(`[Bridge] Realm resumed: ${realm.displayName}`);
      }
    } catch (err) {
      this.gamePhase = 'onboarding';
      const message = err instanceof Error ? err.message : 'Failed to resume realm';
      this.send(ws, { type: 'error', message });
    }
  }

  private async handleRemoveRealm(ws: WebSocket, msg: RemoveRealmMessage): Promise<void> {
    if (this.realmRegistry.getLastActiveRealmId() === msg.realm_id) {
      this.realmRegistry.clearLastActiveRealmId();
    }
    this.realmRegistry.removeRealm(msg.realm_id);
    await this.realmRegistry.save();
    await this.worldStatePersistence.remove(msg.realm_id);
    this.send(ws, { type: 'realm:removed', realm_id: msg.realm_id });
  }

  private rebuildAgentMap(): AgentMapResult {
    // Build specs in insertion order, oracle always first
    const specs: Array<{ agentId: string; name: string; role: string }> = [];
    const oracle = this.worldState.agents.get('oracle');
    if (oracle) specs.push({ agentId: 'oracle', name: oracle.name, role: oracle.role });
    for (const [id, agent] of this.worldState.agents) {
      if (id !== 'oracle') specs.push({ agentId: id, name: agent.name, role: agent.role });
    }
    const result = this.mapGenerator.generateAgentMap(specs);
    this.worldState.setMap(result.map);
    this.worldState.setObjects(result.objects);
    this.eventTranslator.setObjects(result.objects);
    for (const [agentId, pos] of Object.entries(result.agentPositions)) {
      this.agentRoomPositions.set(agentId, pos);
    }
    return result;
  }

  /** Debounced save — coalesces rapid events into a single write 1s later. */
  private scheduleSave(): void {
    if (!this.activeRealmId) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { void this.executeSave(); }, 1000);
  }

  private async executeSave(): Promise<void> {
    if (!this.activeRealmId) return;
    // Sync ProcessController turn counts into WorldState before saving
    const currentState = this.worldState.getProcessState();
    if (this.processController && currentState) {
      this.worldState.setProcessState(this.processController.toJSON(currentState));
    }
    // Sync navigation state
    this.worldState.navigationState = {
      agentNavStacks: Object.fromEntries(this.agentNavStacks),
      agentCurrentPath: Object.fromEntries(this.agentCurrentPath),
    };
    try {
      await this.worldStatePersistence.save(this.activeRealmId, this.worldState);
    } catch (err) {
      console.error('[Bridge] Failed to save world state:', err);
    }
  }

  /** Immediate save — used on graceful shutdown to flush any pending save. */
  async forceSave(): Promise<void> {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    await this.executeSave();
  }

  private async cleanupCurrentRealm(): Promise<void> {
    // Stop any running process controller before dismissing agents
    if (this.processController) {
      this.processController.stop();
      this.processController = null;
    }
    if (this.sessionManager) {
      const activeIds = this.sessionManager.getActiveAgentIds();
      for (const id of activeIds) {
        await this.sessionManager.dismissAgent(id);
        this.worldState.removeAgent(id);
        this.agentSockets.delete(id);
        this.agentNavStacks.delete(id);
        this.agentCurrentPath.delete(id);
      }
    }
    this.agentColorIndex = 0;
    this.agentRoomPositions.clear();
    this.stopAutonomousMovement();
    this.fogBiomeMap = null;
    this.agentFortAssignments.clear();
    this.agentFindingsCounts.clear();
    this.agentMovementTargets.clear();
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.activeRealmId = null;
  }

  // ── Event Wiring ──

  private wireSessionManagerEvents(): void {
    // Translate every SDK message into RPG events and broadcast
    this.sessionManager.on('agent:message', (agentId: string, message: unknown) => {
      // Log every SDK message
      if (this.transcriptLogger) {
        this.transcriptLogger.log(agentId, message).catch(() => {});
      }

      const rpgEvents = this.eventTranslator.translate(agentId, message);
      for (const event of rpgEvents) {
        this.broadcastRPGEvent(event);
      }
    });

    // Agent completed its task
    this.sessionManager.on('agent:complete', (agentId: string) => {
      this.worldState.updateAgentStatus(agentId, 'idle');
      this.broadcast({
        type: 'agent:activity',
        agent_id: agentId,
        activity: 'Task complete — waiting for instructions',
      });
    });

    // Agent went idle — notify process controller to check stage completion
    this.sessionManager.on('agent:idle', (agentId: string) => {
      this.worldState.updateAgentStatus(agentId, 'idle');
      if (this.processController) {
        this.processController.onAgentTurnComplete(agentId).catch((err) => {
          console.error('[Bridge] ProcessController error on agent idle:', err);
        });
      }

      // Gap 2: if all siblings are idle, wake the parent with consolidated findings
      const parentId = this.spawnParent.get(agentId);
      if (parentId && this.sessionManager.getSession(parentId)?.status === 'idle') {
        const siblings = this.spawnChildren.get(parentId) ?? new Set<string>();
        const allIdle = siblings.size > 0 && [...siblings].every(
          (id) => this.worldState.agents.get(id)?.status === 'idle',
        );
        if (allIdle) {
          this.findingsBoard.getRecent(50).then((findings) => {
            const summary = findings.map((f) => `[${f.agent_name}] ${f.finding}`).join('\n');
            this.sessionManager.sendFollowUp(
              parentId,
              `All sub-agents have completed. Findings:\n\n${summary}\n\nContinue with the next phase.`,
            ).catch((err) => {
              console.error('[Bridge] Failed to send follow-up to parent:', err);
            });
            // Clean up tracking maps
            siblings.forEach((id) => this.spawnParent.delete(id));
            this.spawnChildren.delete(parentId);
          }).catch((err) => {
            console.error('[Bridge] Failed to get findings for parent follow-up:', err);
          });
        }
      }

      // Publish idle event to Redis pub/sub channel
      redisPubSub.publish(
        'agent:idle:broadcast',
        JSON.stringify({ agentId, timestamp: new Date().toISOString() }),
      ).catch(() => {});
    });

    // Agent was dismissed
    this.sessionManager.on('agent:dismissed', (agentId: string) => {
      this.worldState.updateAgentStatus(agentId, 'stopped');
    });

    // Agent error
    this.sessionManager.on('agent:error', (agentId: string, err: Error) => {
      console.error(`[Bridge] Agent ${agentId} error:`, err.message);
      this.worldState.updateAgentStatus(agentId, 'stopped');
      this.broadcast({
        type: 'agent:activity',
        agent_id: agentId,
        activity: `Error: ${err.message}`,
      });
    });
  }

  private wireToolHandlerEvents(): void {
    // SummonAgent request
    this.toolHandler.on('summon:request', (request: any) => {
      this.spawnRequestedAgent(request).then((spawnedId) => {
        if (spawnedId && request.requestingAgent) {
          this.spawnParent.set(spawnedId, request.requestingAgent);
          const children = this.spawnChildren.get(request.requestingAgent) ?? new Set<string>();
          children.add(spawnedId);
          this.spawnChildren.set(request.requestingAgent, children);
        }
      }).catch((err) => {
        console.error('[Bridge] Failed to spawn requested agent:', err);
      });
    });

    // Findings posted
    this.toolHandler.on('findings:posted', (data: any) => {
      this.broadcast({
        type: 'findings:posted',
        agent_id: data.agentId,
        agent_name: data.agentName,
        realm: data.finding.realm,
        finding: data.finding.finding,
        severity: data.finding.severity,
      });

      // Thread findings as stage artifacts so they flow to the next stage
      if (this.processController) {
        const currentStage = this.processController.getCurrentStage();
        if (currentStage) {
          const artifactId = `finding_${data.agentId}_${Date.now()}`;
          this.worldState.setArtifact(
            currentStage.id,
            artifactId,
            `[${data.agentName}] ${data.finding.finding}`,
          );
        }
      }

      // Fog-of-war: upgrade fort based on findings count
      if (this.fogBiomeMap) {
        const count = (this.agentFindingsCounts.get(data.agentId) ?? 0) + 1;
        this.agentFindingsCounts.set(data.agentId, count);
        const currentStage = this.worldState.getFortStage(data.agentId);
        if (count === 1 && currentStage < 3) {
          this.updateFortStage(data.agentId, 3);
        } else if (count >= 3 && currentStage < 4) {
          this.updateFortStage(data.agentId, 4);
        }
      }

      this.scheduleSave();
    });

    // Knowledge updated
    this.toolHandler.on('knowledge:updated', (data: any) => {
      const vault = this.sessionManager.getVault(data.agentId);
      if (vault) {
        const knowledge = vault.getKnowledge();
        const level = knowledge.expertise[data.area] ?? 0;
        this.broadcast({
          type: 'agent:level-up',
          agent_id: data.agentId,
          area: data.area,
          new_level: level,
        });
      }
    });

    // Quest claimed
    this.toolHandler.on('quest:claimed', (data: any) => {
      if (data.update) {
        this.broadcast(data.update);
      }
    });

    // Quest completed
    this.toolHandler.on('quest:completed', (data: any) => {
      if (data.update) {
        this.broadcast(data.update);
      }
    });

    // Stage completion signal from agent
    this.toolHandler.on('stage:complete', (data: any) => {
      if (this.processController) {
        this.processController
          .onExplicitStageComplete(data.agentId, data.artifacts)
          .catch((err) => {
            console.error('[Bridge] ProcessController error on explicit stage complete:', err);
          });
      }
    });
  }

  // ── RPG Event Broadcasting ──

  private broadcastRPGEvent(event: RPGEvent): void {
    const agentId = event.agent_id;

    switch (event.type) {
      case 'move_to_file': {
        const obj = event.data.object as { x: number; y: number } | undefined;
        if (obj) {
          this.worldState.applyMove(agentId, obj.x, obj.y);

          // Navigation trigger: check if new position has a nav object
          const navObj = this.getNavObjectAt(agentId, obj.x, obj.y);
          if (navObj) {
            if (navObj.type === 'nav_door') {
              const targetPath = navObj.metadata.targetPath as string;
              this.handleNavigateEnter(agentId, targetPath);
              return;  // map:change replaces the normal action:result broadcast
            } else if (navObj.type === 'nav_back') {
              this.handleNavigateBack(agentId);
              return;  // map:change replaces the normal action:result broadcast
            }
          }

          // Fog reveal: reveal tiles around the agent's new position
          const newlyRevealed = this.worldState.revealTiles(obj.x, obj.y, 5);
          if (newlyRevealed.length > 0) {
            this.broadcast({
              type: 'fog:reveal',
              tiles: newlyRevealed,
              agentId,
            } as ServerMessage);
          }

          // Convert walked tile to path
          this.worldState.convertToPath(obj.x, obj.y);

          this.broadcast({
            type: 'action:result',
            turn_id: 0,
            agent_id: agentId,
            action: 'move',
            params: { x: obj.x, y: obj.y },
            success: true,
          });
        }
        break;
      }

      case 'speak':
        this.broadcast({
          type: 'action:result',
          turn_id: 0,
          agent_id: agentId,
          action: 'speak',
          params: { text: event.data.text as string },
          success: true,
        });
        break;

      case 'think':
        this.broadcast({
          type: 'agent:thought',
          agent_id: agentId,
          text: event.data.text as string,
        });
        break;

      case 'emote':
        this.broadcast({
          type: 'action:result',
          turn_id: 0,
          agent_id: agentId,
          action: 'emote',
          params: { type: event.data.emote as string },
          success: true,
        });
        break;

      case 'skill_effect':
        this.broadcast({
          type: 'action:result',
          turn_id: 0,
          agent_id: agentId,
          action: 'skill',
          params: { text: event.data.text as string },
          success: true,
        });
        break;

      case 'activity':
        this.worldState.updateAgentActivity(agentId, event.data.text as string);
        this.broadcast({
          type: 'agent:activity',
          agent_id: agentId,
          activity: event.data.text as string,
        });
        break;
    }
  }

  // ── Navigation Helpers ──

  private getNavObjectAt(agentId: string, x: number, y: number): MapObject | undefined {
    const currentPath = this.agentCurrentPath.get(agentId) ?? '';
    const node = this.worldState.getMapNode(currentPath);
    const objects = node?.objects ?? this.worldState.getObjects();
    return objects.find(
      o => o.x === x && o.y === y && (o.type === 'nav_door' || o.type === 'nav_back'),
    );
  }

  private handleNavigateEnter(agentId: string, targetPath: string): void {
    const ws = this.agentSockets.get(agentId);
    const agent = this.worldState.agents.get(agentId);
    if (!ws || !agent) {
      console.warn(`[BridgeServer] nav:enter suppressed — agent ${agentId} has no registered socket`);
      return;
    }

    // Reject paths that attempt to escape the repo root
    if (targetPath.includes('..') || targetPath.startsWith('/')) {
      console.warn(`[BridgeServer] nav:enter blocked — path traversal attempt by ${agentId}: ${targetPath}`);
      return;
    }

    const node = this.worldState.getMapNode(targetPath);
    if (!node) return;

    // Push current location onto stack
    const currentPath = this.agentCurrentPath.get(agentId) ?? '';
    const stack = this.agentNavStacks.get(agentId) ?? [];
    stack.push({ path: currentPath, returnPosition: { x: agent.x, y: agent.y } });
    this.agentNavStacks.set(agentId, stack);

    // Generate map if not yet cached on the node
    if (!node.map) {
      const depth = targetPath === '' ? 0 : targetPath.split('/').length;
      const result = this.mapGenerator.generateFolderMap(node, depth);
      node.map = result.map;
      node.objects = result.objects;
      node.entryPosition = result.entryPosition;
      node.doorPositions = result.doorPositions;
    }

    // Update agent tracking
    this.agentCurrentPath.set(agentId, targetPath);
    const spawnPos = node.entryPosition ?? { x: Math.floor(node.map.width / 2), y: 2 };
    this.worldState.applyMove(agentId, spawnPos.x, spawnPos.y);

    // Send map:change to this socket only
    this.send(ws, {
      type: 'map:change',
      path: targetPath,
      map: node.map,
      objects: node.objects ?? [],
      position: spawnPos,
      breadcrumb: spawnPos,
    });

    this.broadcastPresence();
  }

  private handleNavigateBack(agentId: string): void {
    const ws = this.agentSockets.get(agentId);
    if (!ws) {
      console.warn(`[BridgeServer] nav:back suppressed — agent ${agentId} has no registered socket`);
      return;
    }

    const stack = this.agentNavStacks.get(agentId) ?? [];
    if (stack.length === 0) return;  // already at root, nowhere to go

    const frame = stack[stack.length - 1];  // peek without popping
    const node = this.worldState.getMapNode(frame.path);
    if (!node?.map) return;  // validate before committing to the pop

    stack.pop();  // only pop after validation passes
    this.agentNavStacks.set(agentId, stack);
    this.agentCurrentPath.set(agentId, frame.path);

    this.worldState.applyMove(agentId, frame.returnPosition.x, frame.returnPosition.y);

    this.send(ws, {
      type: 'map:change',
      path: frame.path,
      map: node.map,
      objects: node.objects ?? [],
      position: frame.returnPosition,
      breadcrumb: node.entryPosition ?? { x: Math.floor(node.map.width / 2), y: 1 },
    });

    this.broadcastPresence();
  }

  private handlePlayerNavigateEnter(ws: WebSocket, targetPath: string): void {
    if (this.gamePhase !== 'playing') return;

    // Reject paths that attempt to escape the repo root
    if (targetPath.includes('..') || targetPath.startsWith('/')) {
      this.send(ws, { type: 'error', message: `Invalid path: ${targetPath}` });
      return;
    }

    const node = this.worldState.getMapNode(targetPath);
    if (!node) {
      this.send(ws, { type: 'error', message: `No map node for path: ${targetPath}` });
      return;
    }

    // Push current location onto player nav stack
    this.playerNavStack.push({
      path: this.playerCurrentPath,
      returnPosition: { x: 0, y: 0 },
    });

    // Generate map if not cached
    if (!node.map) {
      const depth = targetPath === '' ? 0 : targetPath.split('/').length;
      const result = this.mapGenerator.generateFolderMap(node, depth);
      node.map = result.map;
      node.objects = result.objects;
      node.entryPosition = result.entryPosition;
      node.doorPositions = result.doorPositions;
    }

    this.playerCurrentPath = targetPath;
    this.playerSocket = ws;

    const spawnPos = node.entryPosition ?? { x: Math.floor(node.map!.width / 2), y: 2 };

    this.send(ws, {
      type: 'map:change',
      path: targetPath,
      map: node.map!,
      objects: node.objects ?? [],
      position: spawnPos,
      breadcrumb: spawnPos,
    });
  }

  private handlePlayerNavigateBack(ws: WebSocket): void {
    if (this.playerNavStack.length === 0) return;

    const frame = this.playerNavStack[this.playerNavStack.length - 1];
    const node = this.worldState.getMapNode(frame.path);
    if (!node?.map) return;

    this.playerNavStack.pop();
    this.playerCurrentPath = frame.path;
    this.playerSocket = ws;

    this.send(ws, {
      type: 'map:change',
      path: frame.path,
      map: node.map,
      objects: node.objects ?? [],
      position: frame.returnPosition,
      breadcrumb: node.entryPosition ?? { x: Math.floor(node.map.width / 2), y: 1 },
    });
  }

  // ── Helpers ──

  /** Build a world:state message that includes the current spectator list. */
  // ── Fog-of-War handlers ──────────────────────────

  private handleFortClick(msg: FortClickMessage, ws: WebSocket): void {
    const agent = this.worldState.agents.get(msg.agentId);
    if (!agent) return;

    const ROOM_IMAGES = [
      'room-throne', 'room-forge', 'room-library', 'room-armory',
      'room-dungeon-cell', 'room-greenhouse', 'room-alchemy-lab', 'room-summoning-chamber'
    ];
    const roomImage = msg.agentId === 'oracle'
      ? 'room-throne'
      : ROOM_IMAGES[this.hashString(msg.agentId) % ROOM_IMAGES.length];

    const response: FortViewMessage = {
      type: 'fort:view',
      agentId: msg.agentId,
      roomImage,
      agentInfo: agent,
    };
    this.send(ws, response);
  }

  private handleFortExit(ws: WebSocket): void {
    this.send(ws, this.buildWorldStateMessage());
  }

  updateFortStage(agentId: string, stage: 1 | 2 | 3 | 4 | 5): void {
    this.worldState.setFortStage(agentId, stage);
    const pos = this.worldState.getFortPosition(agentId);
    if (pos) {
      this.broadcast({
        type: 'fort:update',
        agentId,
        stage,
        position: pos,
      } as FortUpdateMessage);
    }
  }

  // ── Autonomous Movement System (Fog-of-War) ──

  private startAutonomousMovement(): void {
    if (this.movementIntervalId) return;
    this.movementIntervalId = setInterval(() => this.tickAgentMovement(), 2500);
  }

  private stopAutonomousMovement(): void {
    if (this.movementIntervalId) {
      clearInterval(this.movementIntervalId);
      this.movementIntervalId = null;
    }
  }

  private tickAgentMovement(): void {
    for (const agent of this.worldState.agents.values()) {
      const target = this.agentMovementTargets.get(agent.agent_id);
      if (!target) continue;

      const dx = target.x - agent.x;
      const dy = target.y - agent.y;

      // If agent reached target, pick a new wander target
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
        // Fort arrival: upgrade to stage 2 (tent) if still at campfire
        const fortPos = this.agentFortAssignments.get(agent.agent_id);
        if (fortPos && Math.abs(agent.x - fortPos.x) <= 2 && Math.abs(agent.y - fortPos.y) <= 2) {
          const currentStage = this.worldState.getFortStage(agent.agent_id);
          if (currentStage < 2) {
            this.updateFortStage(agent.agent_id, 2);
          }
        }
        this.setWanderTarget(agent.agent_id);
        continue;
      }

      // Step one tile toward target, preferring axis with larger delta
      let stepX = 0;
      let stepY = 0;
      if (Math.abs(dx) >= Math.abs(dy)) {
        stepX = dx > 0 ? 1 : -1;
      } else {
        stepY = dy > 0 ? 1 : -1;
      }

      const newX = agent.x + stepX;
      const newY = agent.y + stepY;

      // Check walkability; if blocked, try the other axis
      if (!this.worldState.isWalkable(newX, newY)) {
        if (stepX !== 0) {
          stepX = 0;
          stepY = dy > 0 ? 1 : (dy < 0 ? -1 : 0);
        } else {
          stepY = 0;
          stepX = dx > 0 ? 1 : (dx < 0 ? -1 : 0);
        }
        const altX = agent.x + stepX;
        const altY = agent.y + stepY;
        if (!this.worldState.isWalkable(altX, altY)) {
          this.setWanderTarget(agent.agent_id);
          continue;
        }
        this.moveAgentOnFogMap(agent.agent_id, altX, altY);
      } else {
        this.moveAgentOnFogMap(agent.agent_id, newX, newY);
      }
    }
  }

  private moveAgentOnFogMap(agentId: string, x: number, y: number): void {
    this.worldState.applyMove(agentId, x, y);

    this.broadcast({
      type: 'action:result',
      turn_id: 0,
      agent_id: agentId,
      action: 'move',
      params: { x, y },
      success: true,
    } as ServerMessage);

    const newlyRevealed = this.worldState.revealTiles(x, y, 5);
    if (newlyRevealed.length > 0) {
      this.broadcast({
        type: 'fog:reveal',
        tiles: newlyRevealed,
        agentId,
      } as ServerMessage);
    }

    this.worldState.convertToPath(x, y);
  }

  private setWanderTarget(agentId: string): void {
    const agent = this.worldState.agents.get(agentId);
    if (!agent) return;

    const fortPos = this.agentFortAssignments.get(agentId);
    const ORACLE_X = 60, ORACLE_Y = 60;

    if (this.movementBias === 'outward' && fortPos) {
      this.agentMovementTargets.set(agentId, fortPos);
    } else if (this.movementBias === 'inward') {
      this.agentMovementTargets.set(agentId, { x: ORACLE_X, y: ORACLE_Y });
    } else {
      const center = fortPos ?? { x: agent.x, y: agent.y };
      const wanderRadius = 8;
      const wx = center.x + Math.floor(Math.random() * wanderRadius * 2) - wanderRadius;
      const wy = center.y + Math.floor(Math.random() * wanderRadius * 2) - wanderRadius;
      const clampedX = Math.max(1, Math.min(wx, (this.worldState.map?.width ?? 120) - 2));
      const clampedY = Math.max(1, Math.min(wy, (this.worldState.map?.height ?? 120) - 2));
      this.agentMovementTargets.set(agentId, { x: clampedX, y: clampedY });
    }
  }

  private hashString(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  }

  private buildWorldStateMessage(): ServerMessage {
    const snapshot = this.worldState.getSnapshot();
    const spectators = Array.from(this.spectatorInfo.values());
    return {
      ...snapshot,
      spectators,
      ...(this.fogBiomeMap ? { biomeMap: this.fogBiomeMap } : {}),
    };
  }

  private stripMapData(node: MapNode): MapNodeSummary {
    const { map: _m, objects: _o, ...rest } = node;
    return { ...rest, children: rest.children.map(c => this.stripMapData(c)) };
  }

  /**
   * Broadcasts realm:presence to all connected clients showing where each agent is
   * in the folder hierarchy. Called from navigation handlers (Task 5) whenever an
   * agent enters or exits a subfolder.
   */
  private broadcastPresence(): void {
    const players = Array.from(this.agentCurrentPath.entries()).map(([id, path]) => {
      const agent = this.worldState.agents.get(id);
      return {
        id,
        name: agent?.name ?? id,
        path,
        depth: path === '' ? 0 : path.split('/').length,
      };
    });
    this.broadcast({ type: 'realm:presence', players });
  }

  private nextColor(): number {
    const color = AGENT_COLORS[this.agentColorIndex % AGENT_COLORS.length];
    this.agentColorIndex++;
    return color;
  }

  /**
   * Gracefully shut down the server — close all WebSocket connections, stop
   * the WSS, and dismiss any active agent sessions so the port is released.
   */
  async close(): Promise<void> {
    console.log('[Bridge] Shutting down...');
    this.stopAutonomousMovement();

    // Clear active realm on clean shutdown so we don't auto-load on next start
    this.realmRegistry.clearLastActiveRealmId();
    await this.realmRegistry.save().catch((err) => {
      console.error('[Bridge] Failed to save realm registry on shutdown:', err);
    });

    // Dismiss all active agent sessions
    if (this.sessionManager) {
      const ids = this.sessionManager.getActiveAgentIds();
      await Promise.allSettled(ids.map((id) => this.sessionManager.dismissAgent(id)));
    }

    // Close all open client sockets with a proper WebSocket close frame so
    // clients (e.g. Python agents) receive a clean close and don't throw
    // ConnectionClosedError. Fall back to terminate() after 2 s.
    const closePromises = Array.from(this.allSockets).map(
      (ws) =>
        new Promise<void>((resolve) => {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.once('close', resolve);
            ws.close(1001, 'Server shutting down');
            setTimeout(() => { ws.terminate(); resolve(); }, 2000);
          } else {
            resolve();
          }
        }),
    );
    await Promise.allSettled(closePromises);
    this.allSockets.clear();

    // Close the WebSocket server and release the port
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    console.log('[Bridge] Server closed.');
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.allSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
