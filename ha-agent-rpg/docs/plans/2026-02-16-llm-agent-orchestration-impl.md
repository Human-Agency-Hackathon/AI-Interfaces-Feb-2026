# LLM Agent Orchestration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace scripted agent brains with real Claude Agent SDK sessions that do actual coding work, observed and visualized through the RPG interface.

**Architecture:** Each agent is a `query()` call to `@anthropic-ai/claude-agent-sdk`. The bridge server spawns sessions, streams their SDK messages, and translates tool calls into RPG events. Agents self-organize from a single oracle by summoning specialists via custom tools. Knowledge persists in git-tracked `.agent-rpg/` directories.

**Tech Stack:** TypeScript, Node.js, `@anthropic-ai/claude-agent-sdk`, `ws`, Phaser 3, Vite

**Design Doc:** `docs/plans/2026-02-16-llm-agent-orchestration-design.md`

---

## Task 1: Install Claude Agent SDK and Scaffold New Modules

**Files:**
- Modify: `server/package.json`
- Create: `server/src/AgentSessionManager.ts`
- Create: `server/src/EventTranslator.ts`
- Create: `server/src/FindingsBoard.ts`
- Create: `server/src/KnowledgeVault.ts`
- Create: `server/src/CustomToolHandler.ts`
- Create: `server/src/LocalTreeReader.ts`
- Create: `server/src/SystemPromptBuilder.ts`

**Step 1: Install the SDK**

```bash
cd /Users/behranggarakani/GitHub/ha-agent-rpg
npm install @anthropic-ai/claude-agent-sdk -w server
```

**Step 2: Create stub files for all new modules**

Each file gets a minimal export so TypeScript compiles and we can build incrementally.

`server/src/LocalTreeReader.ts`:
```typescript
import { readdir, stat } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface LocalTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

export interface LocalRepoData {
  repoPath: string;
  repoName: string;
  tree: LocalTreeEntry[];
  totalFiles: number;
  languages: Record<string, number>;
  hasRemote: boolean;
  remoteUrl?: string;
}

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.DS_Store',
  'dist', 'build', '.next', '.cache', 'coverage',
  '.agent-rpg',
]);

const LANG_EXTENSIONS: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.js': 'JavaScript',
  '.jsx': 'JavaScript', '.py': 'Python', '.rs': 'Rust',
  '.go': 'Go', '.java': 'Java', '.rb': 'Ruby', '.c': 'C',
  '.cpp': 'C++', '.h': 'C', '.cs': 'C#', '.swift': 'Swift',
  '.kt': 'Kotlin', '.vue': 'Vue', '.svelte': 'Svelte',
  '.css': 'CSS', '.scss': 'SCSS', '.html': 'HTML',
  '.md': 'Markdown', '.json': 'JSON', '.yaml': 'YAML',
  '.yml': 'YAML', '.toml': 'TOML', '.sql': 'SQL',
  '.sh': 'Shell', '.bash': 'Shell',
};

export class LocalTreeReader {
  async analyze(repoPath: string): Promise<LocalRepoData> {
    const tree: LocalTreeEntry[] = [];
    const languages: Record<string, number> = {};
    let totalFiles = 0;

    await this.walkDir(repoPath, repoPath, tree, languages);
    totalFiles = tree.filter(e => e.type === 'blob').length;

    const hasRemote = await this.checkGitRemote(repoPath);
    const remoteUrl = hasRemote ? await this.getRemoteUrl(repoPath) : undefined;

    return {
      repoPath,
      repoName: basename(repoPath),
      tree,
      totalFiles,
      languages,
      hasRemote,
      remoteUrl,
    };
  }

  private async walkDir(
    rootPath: string,
    currentPath: string,
    tree: LocalTreeEntry[],
    languages: Record<string, number>,
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

      const fullPath = join(currentPath, entry.name);
      const relPath = relative(rootPath, fullPath);

      if (entry.isDirectory()) {
        tree.push({ path: relPath, type: 'tree' });
        await this.walkDir(rootPath, fullPath, tree, languages);
      } else if (entry.isFile()) {
        const fileStat = await stat(fullPath);
        tree.push({ path: relPath, type: 'blob', size: fileStat.size });

        // Track languages
        const ext = '.' + entry.name.split('.').pop()?.toLowerCase();
        const lang = LANG_EXTENSIONS[ext];
        if (lang) {
          languages[lang] = (languages[lang] ?? 0) + fileStat.size;
        }
      }
    }
  }

  private async checkGitRemote(repoPath: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
      return true;
    } catch {
      return false;
    }
  }

  private async getRemoteUrl(repoPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: repoPath });
      return stdout.trim();
    } catch {
      return undefined;
    }
  }
}
```

`server/src/FindingsBoard.ts`:
```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface Finding {
  id: string;
  agent_id: string;
  agent_name: string;
  realm: string;
  finding: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
}

export class FindingsBoard {
  private findings: Finding[] = [];
  private filePath: string;

  constructor(repoPath: string) {
    this.filePath = join(repoPath, '.agent-rpg', 'findings', 'board.json');
  }

  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      this.findings = JSON.parse(data);
    } catch {
      this.findings = [];
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.findings, null, 2));
  }

  addFinding(finding: Omit<Finding, 'id' | 'timestamp'>): Finding {
    const entry: Finding = {
      ...finding,
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };
    this.findings.push(entry);
    return entry;
  }

  getAll(): Finding[] {
    return [...this.findings];
  }

  getRecent(limit = 20): Finding[] {
    return this.findings.slice(-limit);
  }

  getSummary(): string {
    if (this.findings.length === 0) return 'No findings yet.';
    return this.findings
      .slice(-10)
      .map(f => `- [${f.agent_name}] ${f.finding}`)
      .join('\n');
  }
}
```

`server/src/KnowledgeVault.ts`:
```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface AgentKnowledge {
  agent_id: string;
  agent_name: string;
  role: string;
  realm: string;
  expertise: Record<string, number>;
  realm_knowledge: Record<string, number>;
  insights: string[];
  task_history: Array<{ task: string; outcome: string; timestamp: string }>;
  files_analyzed: string[];
}

export class KnowledgeVault {
  private knowledge: AgentKnowledge;
  private filePath: string;

  constructor(repoPath: string, agentId: string, defaults: Partial<AgentKnowledge>) {
    this.filePath = join(repoPath, '.agent-rpg', 'knowledge', `${agentId}.json`);
    this.knowledge = {
      agent_id: agentId,
      agent_name: defaults.agent_name ?? agentId,
      role: defaults.role ?? 'unknown',
      realm: defaults.realm ?? '/',
      expertise: defaults.expertise ?? {},
      realm_knowledge: defaults.realm_knowledge ?? {},
      insights: defaults.insights ?? [],
      task_history: defaults.task_history ?? [],
      files_analyzed: defaults.files_analyzed ?? [],
    };
  }

  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      this.knowledge = JSON.parse(data);
    } catch {
      // No existing knowledge — start fresh
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.knowledge, null, 2));
  }

  getKnowledge(): AgentKnowledge {
    return { ...this.knowledge };
  }

  addInsight(insight: string): void {
    this.knowledge.insights.push(insight);
  }

  recordFileAnalyzed(filePath: string): void {
    if (!this.knowledge.files_analyzed.includes(filePath)) {
      this.knowledge.files_analyzed.push(filePath);
    }
    const dir = filePath.split('/').slice(0, -1).join('/') || '/';
    this.knowledge.realm_knowledge[dir] = (this.knowledge.realm_knowledge[dir] ?? 0) + 1;
  }

  incrementExpertise(area: string, amount = 1): void {
    this.knowledge.expertise[area] = (this.knowledge.expertise[area] ?? 0) + amount;
  }

  addTaskHistory(task: string, outcome: string): void {
    this.knowledge.task_history.push({
      task,
      outcome,
      timestamp: new Date().toISOString(),
    });
  }

  getExpertiseSummary(): string {
    const entries = Object.entries(this.knowledge.expertise)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (entries.length === 0) return 'No expertise yet.';
    return entries.map(([area, score]) => `${area}: ${score}`).join(', ');
  }

  getRealmSummary(): string {
    const entries = Object.entries(this.knowledge.realm_knowledge)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
    if (entries.length === 0) return 'No realm knowledge yet.';
    return entries.map(([dir, score]) => `${dir}: ${score}`).join(', ');
  }
}
```

`server/src/SystemPromptBuilder.ts`:
```typescript
import type { AgentKnowledge } from './KnowledgeVault.js';
import type { Finding } from './FindingsBoard.js';

export interface TeamMember {
  agent_id: string;
  agent_name: string;
  role: string;
  realm: string;
  expertise_summary: string;
}

export interface PromptContext {
  agentName: string;
  role: string;
  realm: string;
  mission: string;
  repoPath: string;
  knowledge: AgentKnowledge | null;
  team: TeamMember[];
  findings: Finding[];
  currentTask?: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const sections: string[] = [];

  // Layer 1: Identity
  sections.push(`You are "${ctx.agentName}", a specialist agent working on the codebase at ${ctx.repoPath}.
Your realm is: ${ctx.realm}
Your mission: ${ctx.mission}

You are part of a self-organizing team of AI agents. You do real engineering work — reading code, analyzing architecture, writing fixes, running tests. Focus on your mission and collaborate with your team.`);

  // Layer 2: Knowledge vault
  if (ctx.knowledge && (ctx.knowledge.insights.length > 0 || ctx.knowledge.files_analyzed.length > 0)) {
    sections.push(`FROM YOUR PREVIOUS SESSIONS:
Expertise: ${Object.entries(ctx.knowledge.expertise).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None yet'}
Realm knowledge: ${Object.entries(ctx.knowledge.realm_knowledge).map(([k, v]) => `${k}: ${v}`).join(', ') || 'None yet'}
Key insights:
${ctx.knowledge.insights.slice(-10).map(i => `- ${i}`).join('\n') || '- None yet'}
Files you have analyzed: ${ctx.knowledge.files_analyzed.length} files`);
  }

  // Layer 3: Team roster
  if (ctx.team.length > 0) {
    sections.push(`YOUR TEAM:
${ctx.team.map(t => `- ${t.agent_name} (${t.role}, realm: ${t.realm}, expertise: ${t.expertise_summary})`).join('\n')}

You can request help from teammates by calling the RequestHelp tool.
You can summon new specialists by calling the SummonAgent tool when the work exceeds your capacity.`);
  } else {
    sections.push(`You are currently the only agent. If the work exceeds your capacity, use the SummonAgent tool to request a specialist.`);
  }

  // Layer 4: Shared findings
  if (ctx.findings.length > 0) {
    sections.push(`SHARED FINDINGS BOARD:
${ctx.findings.slice(-15).map(f => `- [${f.agent_name}] ${f.finding}`).join('\n')}`);
  }

  // Layer 5: Current task
  if (ctx.currentTask) {
    sections.push(`CURRENT TASK:
${ctx.currentTask}`);
  }

  // Custom tool instructions
  sections.push(`CUSTOM TOOLS AVAILABLE:
- SummonAgent: Request a new specialist agent when work exceeds your capacity. Provide a name, role, realm (directory scope), and mission.
- RequestHelp: Ask another team member a question. They will respond with their expertise.
- PostFindings: Share an important discovery with the entire team. Use this when you learn something others should know.
- UpdateKnowledge: Save an insight to your personal knowledge vault for future sessions.
- ClaimQuest: Self-assign a quest/issue to work on.
- CompleteQuest: Mark a quest as done with a summary of what you did.

IMPORTANT: After analyzing files or completing tasks, always use UpdateKnowledge to save your key insights and PostFindings to share important discoveries with the team.`);

  return sections.join('\n\n---\n\n');
}
```

`server/src/CustomToolHandler.ts`:
```typescript
/**
 * Handles execution of custom tools called by agent sessions.
 * Stub — will be fully implemented in Task 3.
 */

export interface CustomToolCall {
  tool_name: string;
  tool_input: Record<string, unknown>;
  agent_id: string;
}

export interface CustomToolResult {
  result: Record<string, unknown>;
}

export class CustomToolHandler {
  async handleToolCall(_call: CustomToolCall): Promise<CustomToolResult> {
    return { result: { error: 'Not implemented' } };
  }
}
```

`server/src/EventTranslator.ts`:
```typescript
/**
 * Translates Claude Agent SDK streaming messages into RPG events.
 * Stub — will be fully implemented in Task 4.
 */

export interface RPGEvent {
  type: 'move_to_file' | 'interact_file' | 'speak' | 'think' | 'emote' | 'skill_effect' | 'activity';
  agent_id: string;
  data: Record<string, unknown>;
}

export class EventTranslator {
  translate(_agentId: string, _message: unknown): RPGEvent[] {
    return [];
  }
}
```

`server/src/AgentSessionManager.ts`:
```typescript
/**
 * Manages Claude Agent SDK query() sessions per agent.
 * Stub — will be fully implemented in Task 2.
 */

export interface AgentSessionConfig {
  agentId: string;
  agentName: string;
  role: string;
  realm: string;
  mission: string;
  repoPath: string;
  permissionLevel: 'read-only' | 'write-with-approval' | 'full';
}

export class AgentSessionManager {
  async spawnAgent(_config: AgentSessionConfig): Promise<void> {
    throw new Error('Not implemented');
  }

  async dismissAgent(_agentId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  getActiveAgentIds(): string[] {
    return [];
  }
}
```

**Step 3: Verify compilation**

```bash
npx tsc --noEmit --project server/tsconfig.json
```

Expected: Clean compilation (zero errors).

**Step 4: Commit**

```bash
git add server/package.json server/src/LocalTreeReader.ts server/src/FindingsBoard.ts server/src/KnowledgeVault.ts server/src/SystemPromptBuilder.ts server/src/CustomToolHandler.ts server/src/EventTranslator.ts server/src/AgentSessionManager.ts package-lock.json
git commit -m "feat: add Claude Agent SDK and scaffold new orchestration modules"
```

---

## Task 2: Implement AgentSessionManager (Core Engine)

**Files:**
- Modify: `server/src/AgentSessionManager.ts` (replace stub)

**Step 1: Implement the session manager**

Replace the stub with a full implementation that:
- Extends `EventEmitter` to emit `agent:message`, `agent:complete`, `agent:error`, `agent:idle`, `agent:dismissed` events
- Uses `query()` from `@anthropic-ai/claude-agent-sdk` to spawn sessions
- Maps permission levels to `allowedTools` and `permissionMode`
- Builds system prompts via `SystemPromptBuilder`
- Loads/saves `KnowledgeVault` per agent
- Supports `sendFollowUp()` to resume sessions with new prompts
- Supports `dismissAgent()` to abort and save knowledge
- Provides `getTeamRoster()` for system prompt assembly
- Provides `getVault()` accessor for CustomToolHandler

**Step 2: Verify compilation**

```bash
npx tsc --noEmit --project server/tsconfig.json
```

**Step 3: Commit**

```bash
git add server/src/AgentSessionManager.ts
git commit -m "feat: implement AgentSessionManager with Claude Agent SDK query() lifecycle"
```

---

## Task 3: Implement CustomToolHandler

**Files:**
- Modify: `server/src/CustomToolHandler.ts` (replace stub)

**Step 1: Implement custom tool execution**

Replace the stub with a full implementation that:
- Extends `EventEmitter` to emit `summon:request`, `help:request`, `findings:posted`, `knowledge:updated`, `quest:claimed`, `quest:completed` events
- Takes `FindingsBoard`, `QuestManager`, vault accessor, and name accessor in constructor
- Handles all 6 custom tools: `SummonAgent`, `RequestHelp`, `PostFindings`, `UpdateKnowledge`, `ClaimQuest`, `CompleteQuest`
- `SummonAgent` emits event for bridge server to handle spawn decision
- `RequestHelp` emits event for bridge server to route to target agent
- `PostFindings` writes to FindingsBoard and saves
- `UpdateKnowledge` updates agent vault and saves
- `ClaimQuest` / `CompleteQuest` update QuestManager and vault

**Step 2: Verify compilation**

```bash
npx tsc --noEmit --project server/tsconfig.json
```

**Step 3: Commit**

```bash
git add server/src/CustomToolHandler.ts
git commit -m "feat: implement CustomToolHandler for SummonAgent, RequestHelp, PostFindings, etc."
```

---

## Task 4: Implement EventTranslator

**Files:**
- Modify: `server/src/EventTranslator.ts` (replace stub)

**Step 1: Implement SDK-to-RPG event translation**

Replace the stub with a full implementation that:
- Tracks current tool per agent via `content_block_start` / `content_block_stop`
- Accumulates text deltas and flushes as batched `speak` events
- Maps tool names to RPG events:
  - `Read` -> think "Reading file..."
  - `Edit`/`Write` -> skill_effect "Writing code..."
  - `Bash` -> emote exclamation + activity "Running command..."
  - `Grep`/`Glob` -> think "Searching codebase..."
  - `SummonAgent` -> speak "I need to summon a specialist..."
  - `RequestHelp` -> speak "Requesting help from a teammate..."
  - `PostFindings` -> speak "Sharing findings with the team..."
- Handles both streaming (`stream_event`) and non-streaming (`assistant`) message types
- Provides `findObjectForFile()` to locate MapObject by file path
- Provides `setObjects()` to update the object list

**Step 2: Verify compilation**

```bash
npx tsc --noEmit --project server/tsconfig.json
```

**Step 3: Commit**

```bash
git add server/src/EventTranslator.ts
git commit -m "feat: implement EventTranslator mapping SDK messages to RPG events"
```

---

## Task 5: Update Protocol Types

**Files:**
- Modify: `shared/protocol.ts`
- Modify: `server/src/types.ts`

**Step 1: Add new types and message interfaces**

Add to both files:
- `AgentStats` interface (realm_knowledge, expertise, codebase_fluency, collaboration_score)
- `SpawnRequestMessage` (agent:spawn-request)
- `AgentActivityMessage` (agent:activity)
- `FindingsPostedMessage` (findings:posted)
- `KnowledgeLevelUpMessage` (agent:level-up)
- `SessionSettings` interface (max_agents, token_budget_usd, permission_level, autonomy_mode)
- `UpdateSettingsMessage` (player:update-settings)

Update `AgentInfo` to replace `hp/mp/max_hp/max_mp/archetype_id` with `role`, `realm`, `stats: AgentStats`, `status`.

Update `LinkRepoMessage.repo_url` comment to note it accepts local paths.

Add new message types to `ServerMessage` union type.

**Step 2: Note — this will cause type errors in existing code**

Files that reference old `AgentInfo` fields will break. These are fixed in Tasks 6 and 7.

**Step 3: Commit**

```bash
git add shared/protocol.ts server/src/types.ts
git commit -m "feat: update protocol with skill-based stats, spawn requests, activity messages"
```

---

## Task 6: Rewrite BridgeServer for SDK Orchestration

**Files:**
- Modify: `server/src/BridgeServer.ts` (major rewrite)
- Modify: `server/src/WorldState.ts` (update AgentInfo handling)

This is the largest task.

**Step 1: Update WorldState**

- Remove HP/MP fields from `addAgent`
- Add `role`, `realm`, `stats`, `status` fields to `addAgent`
- Remove `applySkill` method (no more combat)
- Keep `applyMove` for spatial positioning
- Add `updateAgentStatus(agent_id, status)` method
- Add `updateAgentActivity(agent_id, activity)` method
- Update `getSnapshot()` to return new AgentInfo shape

**Step 2: Rewrite BridgeServer**

Key changes:
- Remove imports: `TurnManager`, `AgentBrain`, `AgentLibrary`
- Add imports: `AgentSessionManager`, `EventTranslator`, `CustomToolHandler`, `FindingsBoard`, `LocalTreeReader`, `TranscriptLogger`
- Remove class fields: `turnManager`, `agentBrains`, `repoAnalyzer` (keep for GitHub URL fallback)
- Add class fields: `sessionManager`, `eventTranslator`, `toolHandler`, `findingsBoard`, `localTreeReader`, `transcriptLogger`, `settings: SessionSettings`
- New `gamePhase`: `'onboarding' | 'analyzing' | 'playing'`

New `handleLinkRepo`:
1. Check if `repo_url` starts with `/` or `~` — if so, treat as local path
2. If local path: validate directory exists, use `LocalTreeReader.analyze()`
3. If GitHub URL: clone to temp dir via `git clone`, then use `LocalTreeReader.analyze()`
4. Generate map from local tree data via `MapGenerator`
5. Initialize `FindingsBoard`, load existing knowledge
6. Broadcast `repo:ready`
7. Auto-spawn oracle agent via `AgentSessionManager`

Remove `handleDeploy` — oracle spawns automatically.

New event wiring in constructor:
- `sessionManager.on('agent:message')` -> run through `EventTranslator`, broadcast RPG events, log via `TranscriptLogger`
- `sessionManager.on('agent:complete')` -> update agent status to idle
- `sessionManager.on('agent:error')` -> broadcast error
- `toolHandler.on('summon:request')` -> check budget, spawn new agent or deny
- `toolHandler.on('findings:posted')` -> broadcast to client
- `toolHandler.on('quest:claimed')` / `quest:completed` -> broadcast quest:update

New `handlePlayerCommand`:
- Route to specific agent if prefixed (e.g., "Engineer, fix...") or to oracle by default
- Call `sessionManager.sendFollowUp(agentId, command)`

New `handleUpdateSettings`:
- Store settings
- Apply permission level changes to active sessions

**Step 3: Fix all remaining type errors**

After rewrite, run:
```bash
npx tsc --noEmit --project server/tsconfig.json
```

Fix any remaining issues.

**Step 4: Commit**

```bash
git add server/src/BridgeServer.ts server/src/WorldState.ts
git commit -m "feat: rewrite BridgeServer as SDK orchestration hub, remove turn system"
```

---

## Task 7: Update Client for New Architecture

**Files:**
- Modify: `client/src/screens/RepoScreen.ts`
- Remove: `client/src/screens/RecruitScreen.ts`
- Modify: `client/src/main.ts`
- Modify: `client/src/scenes/GameScene.ts`
- Modify: `client/src/scenes/UIScene.ts`
- Modify: `client/src/systems/AgentSprite.ts`
- Modify: `client/src/panels/SidebarPanel.ts`
- Modify: `client/src/panels/DialogueLog.ts`
- Modify: `client/index.html`
- Modify: `client/src/types.ts`

**Step 1: Update RepoScreen**

Change input placeholder to: `"Local path or GitHub URL (e.g. /Users/you/project)"`. Add helper text explaining both local paths and GitHub URLs are accepted.

**Step 2: Remove RecruitScreen**

Delete `client/src/screens/RecruitScreen.ts`. Remove all imports and references from `main.ts`. Remove `#recruit-screen` container from `index.html`.

**Step 3: Update main.ts**

New flow: TitleScreen -> RepoScreen -> (on repo:ready) -> startGame immediately.

Add handlers for new message types:
- `agent:joined` — add agent to sidebar dynamically
- `agent:activity` — update agent status in sidebar
- `agent:spawn-request` — show notification
- `findings:posted` — add to dialogue log
- `agent:level-up` — trigger visual effect

**Step 4: Update AgentSprite**

Replace HP bar with:
- Role label text (below name)
- Status dot: green circle = running, yellow = idle, grey = stopped
- Remove `updateHP()` method
- Add `updateStatus(status)` method
- Add `updateActivity(activity)` method

**Step 5: Update client/src/types.ts**

Mirror the protocol changes: new AgentInfo shape, new message types.

**Step 6: Add settings panel to sidebar**

Add HTML controls to SidebarPanel:
- Max agents (number input)
- Budget cap (number input in USD)
- Permission level (select: read-only, write-with-approval, full)
- Autonomy mode (select: manual, supervised, autonomous)

Wire to send `player:update-settings` on change.

**Step 7: Update index.html**

- Remove `#recruit-screen` container
- Add settings section styling

**Step 8: Verify client builds**

```bash
cd /Users/behranggarakani/GitHub/ha-agent-rpg/client && npx vite build 2>&1 | tail -5
```

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: update client for SDK orchestration — remove recruit, add settings, dynamic agents"
```

---

## Task 8: Wire Up Logging

**Files:**
- Create: `server/src/TranscriptLogger.ts`
- Modify: `server/src/BridgeServer.ts` (add logging calls)

**Step 1: Create TranscriptLogger**

Simple JSONL appender that writes every SDK message to `.agent-rpg/logs/{agent_id}/{date}.jsonl`.

**Step 2: Wire into BridgeServer**

In the `agent:message` event handler from AgentSessionManager, call `transcriptLogger.log(agentId, message)`.

**Step 3: Commit**

```bash
git add server/src/TranscriptLogger.ts server/src/BridgeServer.ts
git commit -m "feat: add TranscriptLogger for full agent session logging"
```

---

## Task 9: Add .agent-rpg Template

**Files:**
- Create: template `.agent-rpg/.gitignore`

**Step 1: Create the template**

When the bridge server initializes `.agent-rpg/` in a target repo, it should include a `.gitignore` that tracks knowledge and findings but ignores large log files:

```
# Agent RPG — track knowledge and findings, ignore logs
logs/
```

**Step 2: Commit**

```bash
git add -A
git commit -m "feat: add .agent-rpg/.gitignore template (track knowledge, ignore logs)"
```

---

## Task 10: Integration Test — End-to-End Smoke Test

**Step 1: Start server and client**

```bash
npm run dev:server
# In another terminal:
npm run dev:client
```

**Step 2: Manual test flow**

1. Open http://localhost:5173
2. Click "Begin Quest"
3. Enter a local repo path (e.g., the ha-agent-rpg repo itself: `/Users/behranggarakani/GitHub/ha-agent-rpg`)
4. Verify map generates and game starts
5. Verify oracle agent spawns and begins exploring (SDK messages stream)
6. Watch RPG events (agent moves, speaks, thinks)
7. Check `.agent-rpg/` directory created in target repo
8. Test settings panel
9. Test player commands

**Step 3: Fix any issues**

**Step 4: Final commit and push**

```bash
git add -A
git commit -m "fix: integration fixes from end-to-end smoke test"
git push
```

---

## Task Order & Dependencies

```
Task 1: Install SDK + scaffold stubs
  |
  +---> Task 2: AgentSessionManager (can parallel)
  +---> Task 3: CustomToolHandler   (can parallel)
  +---> Task 4: EventTranslator     (can parallel)
  |
  v
Task 5: Update protocol types
  |
  v
Task 6: Rewrite BridgeServer  <-- integration point
  |
  v
Task 7: Update client
  |
  v
Task 8: Wire up logging
  |
  v
Task 9: .agent-rpg template
  |
  v
Task 10: Integration test
```

Tasks 2, 3, 4 are independent and can be developed in parallel after Task 1. Task 5 must come before 6 and 7. Task 6 is the critical integration point.
