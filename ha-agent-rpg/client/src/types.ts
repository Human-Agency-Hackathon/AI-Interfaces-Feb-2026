// Re-export shared protocol types for client use.
// Kept in sync with shared/protocol.ts.

// ── Spectator Identity ──
export interface SpectatorInfo {
  spectator_id: string;
  name: string;
  color: number;
}

// ── Agent Identity ──
export interface AgentStats {
  realm_knowledge: Record<string, number>;   // directory -> familiarity score
  expertise: Record<string, number>;         // skill area -> level
  codebase_fluency: number;                  // aggregate repo familiarity (0-100)
  collaboration_score: number;               // how often peers consult this agent
}

export interface AgentInfo {
  agent_id: string;
  name: string;
  color: number;
  x: number;
  y: number;
  role: string;                              // e.g. "Oracle", "Guardian of API Quality"
  realm: string;                             // directory scope, e.g. "src/api/"
  stats: AgentStats;
  status: 'starting' | 'running' | 'idle' | 'stopped';
  current_activity?: string;
}

// ── Action Params ──
export interface MoveParams { x: number; y: number }
export interface SpeakParams { text: string; emote?: string }
export interface SkillParams { skill_id: string; target_id: string }
export interface InteractParams { object_id: string }
export interface EmoteParams { type: 'exclamation' | 'question' | 'heart' | 'sweat' | 'music' }
export interface WaitParams { duration_ms: number }
export interface ThinkParams { text: string }

export type ActionType = 'move' | 'speak' | 'skill' | 'interact' | 'emote' | 'wait' | 'think';

// ── Map & World Data ──
export interface TileMapData {
  width: number;
  height: number;
  tile_size: number;
  tiles: number[][];
}

export interface MapObject {
  id: string;
  type: 'file' | 'config' | 'doc' | 'quest_marker' | 'sign' | 'nav_door' | 'nav_back';
  x: number;
  y: number;
  label: string;
  metadata: Record<string, unknown>;
}

// ── Hierarchical map types ──

export interface MapNode {
  path: string;
  name: string;
  type: 'folder' | 'file';
  children: MapNode[];
  map?: TileMapData;
  objects?: MapObject[];
  doorPositions: Record<string, { x: number; y: number }>;
  entryPosition?: { x: number; y: number };
}

// Recursive summary type that strips tile data at every depth level
export type MapNodeSummary = Omit<MapNode, 'map' | 'objects' | 'children'> & {
  children: MapNodeSummary[];
}

export interface Quest {
  quest_id: string;
  title: string;
  body: string;
  labels: string[];
  priority: 'low' | 'medium' | 'high';
  source_url: string;
  related_files: string[];
}

export interface RepoStats {
  total_files: number;
  total_lines: number;
  languages: Record<string, number>;
  open_issues: number;
  last_commit: string;
}

// ── Messages: Agent → Server ──
export interface AgentRegisterMessage {
  type: 'agent:register';
  agent_id: string;
  name: string;
  color: number;
}

export interface AgentActionMessage {
  type: 'agent:action';
  agent_id: string;
  turn_id: number;
  action: ActionType;
  params: MoveParams | SpeakParams | SkillParams | InteractParams | EmoteParams | WaitParams | ThinkParams;
}

// ── Messages: Spectator → Server ──
export interface SpectatorRegisterMessage {
  type: 'spectator:register';
  name: string;
  color: number;
}

export interface SpectatorCommandMessage {
  type: 'spectator:command';
  spectator_id: string;
  name: string;
  color: number;
  text: string;
}

// ── Messages: Player → Server ──
export interface GetAgentDetailsMessage {
  type: 'player:get-agent-details';
  agent_id: string;
}

export interface LinkRepoMessage {
  type: 'player:link-repo';
  repo_url: string;   // Local path (/path/to/repo) or GitHub URL
}

export interface PlayerCommandMessage {
  type: 'player:command';
  text: string;
}

export interface UpdateSettingsMessage {
  type: 'player:update-settings';
  settings: SessionSettings;
}

export interface DismissAgentMessage {
  type: 'player:dismiss-agent';
  agent_id: string;
}

// ── Messages: Server → All ──
export interface WorldStateMessage {
  type: 'world:state';
  tick: number;
  agents: AgentInfo[];
  map: TileMapData;
  objects: MapObject[];
  quests: Quest[];
  spectators?: SpectatorInfo[];
}

export interface SpectatorWelcomeMessage {
  type: 'spectator:welcome';
  spectator_id: string;
  name: string;
}

export interface SpectatorJoinedMessage {
  type: 'spectator:joined';
  spectator_id: string;
  name: string;
  color: number;
}

export interface SpectatorLeftMessage {
  type: 'spectator:left';
  spectator_id: string;
}

export interface ActionResultMessage {
  type: 'action:result';
  turn_id: number;
  agent_id: string;
  action: ActionType;
  params: Record<string, unknown>;
  success: boolean;
  error?: string;
}

export interface AgentJoinedMessage {
  type: 'agent:joined';
  agent: AgentInfo;
}

export interface AgentLeftMessage {
  type: 'agent:left';
  agent_id: string;
}

export interface RepoReadyMessage {
  type: 'repo:ready';
  repo_name: string;
  map: TileMapData;
  quests: Quest[];
  objects: MapObject[];
  stats: RepoStats;
}

export interface QuestUpdateMessage {
  type: 'quest:update';
  quest_id: string;
  status: 'open' | 'assigned' | 'in_progress' | 'done';
  agent_id?: string;
}

export interface AgentThoughtMessage {
  type: 'agent:thought';
  agent_id: string;
  text: string;
}

export interface SpawnRequestMessage {
  type: 'agent:spawn-request';
  requesting_agent_id: string;
  requested_name: string;
  requested_role: string;
  requested_realm: string;
  requested_mission: string;
  priority: 'low' | 'medium' | 'high';
}

export interface AgentActivityMessage {
  type: 'agent:activity';
  agent_id: string;
  activity: string;        // e.g. "Reading src/api/users.ts"
  tool_name?: string;      // e.g. "Read", "Edit", "Bash"
}

export interface FindingsPostedMessage {
  type: 'findings:posted';
  agent_id: string;
  agent_name: string;
  realm: string;
  finding: string;
  severity: 'low' | 'medium' | 'high';
}

export interface KnowledgeLevelUpMessage {
  type: 'agent:level-up';
  agent_id: string;
  area: string;
  new_level: number;
}

export interface AgentDetailsMessage {
  type: 'agent:details';
  agent_id: string;
  info: AgentInfo;
  knowledge: {
    expertise: Record<string, number>;
    insights: string[];
    task_history: Array<{ task: string; outcome: string; timestamp: string }>;
  };
  findings: Array<{
    id: string;
    finding: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: string;
  }>;
  transcript: {
    thoughts: Array<{ text: string; timestamp: string }>;
    actions: Array<{ tool: string; input: string; timestamp: string }>;
  };
  tools: string[];
}

export interface SessionSettings {
  max_agents: number;
  token_budget_usd: number;
  permission_level: 'read-only' | 'write-with-approval' | 'full';
  autonomy_mode: 'manual' | 'supervised' | 'autonomous';
}

// ── Realm Tracking ──
export interface RealmEntry {
  id: string;
  path: string;
  name: string;
  displayName: string;
  lastExplored: string;
  gitInfo: {
    lastCommitSha: string;
    branch: string;
    remoteUrl: string | null;
  };
  stats: {
    totalFiles: number;
    languages: string[];
    agentsUsed: number;
    findingsCount: number;
    questsTotal: number;
    questsCompleted: number;
  };
  mapSnapshot: {
    rooms: number;
    tileWidth: number;
    tileHeight: number;
  };
}

export interface RealmEntryWithChanges extends RealmEntry {
  changesSinceLastScan: number | null;
}

// ── Messages: Player → Server (Realm) ──
export interface ListRealmsMessage {
  type: 'player:list-realms';
}

export interface ResumeRealmMessage {
  type: 'player:resume-realm';
  realm_id: string;
}

export interface RemoveRealmMessage {
  type: 'player:remove-realm';
  realm_id: string;
}

// ── Messages: Server → All (Realm) ──
export interface RealmListMessage {
  type: 'realm:list';
  realms: RealmEntryWithChanges[];
}

export interface RealmRemovedMessage {
  type: 'realm:removed';
  realm_id: string;
}

// ── Messages: Server → Client (Navigation) ──

export interface MapChangeMessage {
  type: 'map:change';
  path: string;
  map: TileMapData;
  objects: MapObject[];
  position: { x: number; y: number };
  breadcrumb: { x: number; y: number };
}

export interface PlayerPresence {
  id: string;
  name: string;
  path: string;
  depth: number;
}

export interface RealmPresenceMessage {
  type: 'realm:presence';
  players: PlayerPresence[];
}

export interface RealmTreeMessage {
  type: 'realm:tree';
  root: MapNodeSummary;
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface ServerInfoMessage {
  type: 'server:info';
  addresses: string[];
  port: number;
  gamePhase: 'onboarding' | 'analyzing' | 'playing';
  activeRealmId: string | null;
}

// ── Messages: Player → Server (Process) ──

export interface StartProcessMessage {
  type: 'player:start-process';
  problem: string;
  processId?: string;
}

// ── Messages: Server → All (Process) ──

export interface ProcessStartedMessage {
  type: 'process:started';
  processId: string;
  problem: string;
  processName: string;
  currentStageId: string;
  currentStageName: string;
  totalStages: number;
}

export interface StageAdvancedMessage {
  type: 'stage:advanced';
  fromStageId: string;
  fromStageName: string;
  toStageId: string | null;
  toStageName: string | null;
  stageIndex: number;
  totalStages: number;
}

export interface StageCompletedMessage {
  type: 'stage:completed';
  stageId: string;
  artifacts: Record<string, string>;
  isFinal: boolean;
}

export interface IdeaProposedMessage {
  type: 'idea:proposed';
  ideaId: string;
  agentId: string;
  agentName: string;
  stageId: string;
  content: string;
}

export interface IdeaVotedMessage {
  type: 'idea:voted';
  ideaId: string;
  agentId: string;
  vote: 'up' | 'down';
}

// ── Fog-of-War messages ──────────────────────────────────────────────

export interface FogRevealMessage {
  type: 'fog:reveal';
  tiles: { x: number; y: number }[];
  agentId: string;
}

export interface FortUpdateMessage {
  type: 'fort:update';
  agentId: string;
  stage: 1 | 2 | 3 | 4 | 5;
  position: { x: number; y: number };
}

export interface FortViewMessage {
  type: 'fort:view';
  agentId: string;
  roomImage: string;
  agentInfo: AgentInfo;
}

export interface FortClickMessage {
  type: 'fort:click';
  agentId: string;
}

export interface FortExitMessage {
  type: 'fort:exit';
}

// ── Union types ──
export interface PlayerNavigateEnterMessage {
  type: 'player:navigate-enter';
  target_path: string;
}

export interface PlayerNavigateBackMessage {
  type: 'player:navigate-back';
}

export interface PlayerMoveMessage {
  type: 'player:move';
  direction: 'up' | 'down' | 'left' | 'right';
}

export type ClientMessage =
  | AgentRegisterMessage
  | AgentActionMessage
  | LinkRepoMessage
  | PlayerCommandMessage
  | UpdateSettingsMessage
  | DismissAgentMessage
  | GetAgentDetailsMessage
  | ListRealmsMessage
  | ResumeRealmMessage
  | RemoveRealmMessage
  | PlayerNavigateEnterMessage
  | PlayerNavigateBackMessage
  | PlayerMoveMessage
  | StartProcessMessage
  | SpectatorRegisterMessage
  | SpectatorCommandMessage
  | FortClickMessage
  | FortExitMessage;

export type ServerMessage =
  | WorldStateMessage
  | ActionResultMessage
  | AgentJoinedMessage
  | AgentLeftMessage
  | RepoReadyMessage
  | QuestUpdateMessage
  | AgentThoughtMessage
  | AgentActivityMessage
  | SpawnRequestMessage
  | FindingsPostedMessage
  | KnowledgeLevelUpMessage
  | AgentDetailsMessage
  | RealmListMessage
  | RealmRemovedMessage
  | MapChangeMessage
  | RealmPresenceMessage
  | RealmTreeMessage
  | ErrorMessage
  | ProcessStartedMessage
  | StageAdvancedMessage
  | StageCompletedMessage
  | IdeaProposedMessage
  | IdeaVotedMessage
  | SpectatorWelcomeMessage
  | SpectatorJoinedMessage
  | SpectatorLeftMessage
  | SpectatorCommandMessage
  | ServerInfoMessage
  | FogRevealMessage
  | FortUpdateMessage
  | FortViewMessage;
