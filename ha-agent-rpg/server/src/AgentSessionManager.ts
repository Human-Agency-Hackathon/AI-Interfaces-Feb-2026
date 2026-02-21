/**
 * Manages Claude Agent SDK query() sessions per agent.
 * Spawns, tracks, and dismisses agent sessions with knowledge persistence.
 */

import { EventEmitter } from 'node:events';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKMessage, SDKResultMessage, SDKSystemMessage } from '@anthropic-ai/claude-agent-sdk';
import { KnowledgeVault } from './KnowledgeVault.js';
import { FindingsBoard } from './FindingsBoard.js';
import { buildSystemPrompt } from './SystemPromptBuilder.js';
import type { TeamMember } from './SystemPromptBuilder.js';
import { createRpgMcpServer, createBrainstormMcpServer } from './RpgMcpServer.js';
import type { CustomToolHandler } from './CustomToolHandler.js';

export interface AgentSessionConfig {
  agentId: string;
  agentName: string;
  role: string;
  realm: string;
  mission: string;
  repoPath: string;
  permissionLevel: 'read-only' | 'write-with-approval' | 'full';
  /** Present when the agent is part of a brainstorming process. */
  processContext?: ProcessAgentContext;
}

/** Context injected into an agent's system prompt during a brainstorming process. */
export interface ProcessAgentContext {
  /** The user's problem statement */
  problem: string;
  /** The process template name, e.g. "Standard Brainstorm" */
  processName: string;
  /** Current stage ID */
  stageId: string;
  /** Current stage display name */
  stageName: string;
  /** What this stage is trying to accomplish */
  stageGoal: string;
  /** Zero-based index of this stage in the overall process */
  stageIndex: number;
  /** Total number of stages */
  totalStages: number;
  /** This agent's persona description */
  persona: string;
  /** Artifacts collected from all prior stages: stageId → artifactId → content */
  priorArtifacts: Record<string, Record<string, string>>;
}

interface ActiveSession {
  config: AgentSessionConfig;
  vault: KnowledgeVault;
  sessionId?: string;
  abortController: AbortController;
  status: 'starting' | 'running' | 'idle' | 'stopped';
  pendingPrompts: string[];
  autoSaveInterval: ReturnType<typeof setInterval>;
}

const PERMISSION_MAP: Record<
  AgentSessionConfig['permissionLevel'],
  { allowedTools: string[]; permissionMode: string }
> = {
  'read-only': {
    allowedTools: ['Read', 'Glob', 'Grep'],
    permissionMode: 'bypassPermissions',
  },
  'write-with-approval': {
    allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Write'],
    permissionMode: 'acceptEdits',
  },
  full: {
    allowedTools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash'],
    permissionMode: 'bypassPermissions',
  },
};

/**
 * Build a clean environment for spawned Claude Code subprocesses.
 * Strips the CLAUDECODE env var to allow nested sessions.
 */
function cleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key === 'CLAUDECODE') continue;          // Allow nested sessions
    if (key === 'CLAUDE_CODE_SESSION') continue;  // Extra safety
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export class AgentSessionManager extends EventEmitter {
  private sessions = new Map<string, ActiveSession>();
  private findingsBoard: FindingsBoard;
  private toolHandler: CustomToolHandler;

  constructor(findingsBoard: FindingsBoard, toolHandler: CustomToolHandler) {
    super();
    this.findingsBoard = findingsBoard;
    this.toolHandler = toolHandler;
  }

  /**
   * Spawn a new agent session. Creates a KnowledgeVault, builds the system
   * prompt, and starts a query() call in the background.
   */
  async spawnAgent(config: AgentSessionConfig): Promise<void> {
    if (this.sessions.has(config.agentId)) {
      throw new Error(`Agent "${config.agentId}" is already active`);
    }

    // Create and load knowledge vault
    const vault = new KnowledgeVault(config.repoPath, config.agentId, {
      agent_name: config.agentName,
      role: config.role,
      realm: config.realm,
    });
    await vault.load();

    const abortController = new AbortController();

    // Periodic auto-save: flush vault every 60 s so a crash loses ≤ 1 min of knowledge
    const autoSaveInterval = setInterval(() => {
      vault.save().catch(() => { /* best-effort */ });
    }, 60_000);

    const session: ActiveSession = {
      config,
      vault,
      abortController,
      status: 'starting',
      pendingPrompts: [],
      autoSaveInterval,
    };

    this.sessions.set(config.agentId, session);

    // Fire-and-forget — errors are emitted as events
    this.runSession(session).catch((err) => {
      this.emit('agent:error', config.agentId, err);
    });
  }

  /**
   * Send a follow-up prompt to an existing idle session by resuming it.
   */
  async sendFollowUp(agentId: string, prompt: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new Error(`No active session for agent "${agentId}"`);
    }

    // If the session isn't idle yet, queue the prompt for later
    if (!session.sessionId || session.status === 'starting' || session.status === 'running') {
      session.pendingPrompts.push(prompt);
      console.log(`[AgentSessionManager] Agent "${agentId}" not idle — queued prompt (queue length: ${session.pendingPrompts.length})`);
      return;
    }

    // Reset abort controller for the new run
    session.abortController = new AbortController();
    session.status = 'starting';

    // Run a resumed session in the background
    this.runResumedSession(session, prompt).catch((err) => {
      this.emit('agent:error', agentId, err);
    });
  }

  /**
   * Dismiss an agent — abort the running session, save vault, clean up.
   */
  async dismissAgent(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      return;
    }

    clearInterval(session.autoSaveInterval);
    session.abortController.abort();
    session.status = 'stopped';

    try {
      await session.vault.save();
    } catch {
      // Best-effort save
    }

    this.sessions.delete(agentId);
    this.emit('agent:dismissed', agentId);
  }

  /**
   * Returns the list of currently active agent IDs.
   */
  getActiveAgentIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Returns session info for a given agent.
   */
  getSession(agentId: string): ActiveSession | undefined {
    return this.sessions.get(agentId);
  }

  /**
   * Returns the KnowledgeVault for a given agent.
   */
  getVault(agentId: string): KnowledgeVault | undefined {
    return this.sessions.get(agentId)?.vault;
  }

  /**
   * Build a TeamMember[] list for system prompt construction,
   * excluding the specified agent.
   */
  getTeamRoster(excludeAgentId?: string): TeamMember[] {
    const roster: TeamMember[] = [];
    for (const [id, session] of this.sessions) {
      if (id === excludeAgentId) continue;
      roster.push({
        agent_id: id,
        agent_name: session.config.agentName,
        role: session.config.role,
        realm: session.config.realm,
        expertise_summary: session.vault.getExpertiseSummary(),
      });
    }
    return roster;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * If there are queued prompts for a session that just went idle, kick off
   * the next one immediately.
   */
  private drainPendingPrompts(session: ActiveSession): void {
    if (session.pendingPrompts.length === 0) return;
    const nextPrompt = session.pendingPrompts.shift()!;
    console.log(`[AgentSessionManager] Draining queued prompt for "${session.config.agentId}" (${session.pendingPrompts.length} remaining)`);
    session.abortController = new AbortController();
    session.status = 'starting';
    this.runResumedSession(session, nextPrompt).catch((err) => {
      this.emit('agent:error', session.config.agentId, err);
    });
  }

  /**
   * Builds the system prompt for an agent session.
   */
  private async buildPromptForSession(session: ActiveSession): Promise<string> {
    const { config, vault } = session;
    return buildSystemPrompt({
      agentName: config.agentName,
      role: config.role,
      realm: config.realm,
      mission: config.mission,
      repoPath: config.repoPath,
      knowledge: vault.getKnowledge(),
      team: this.getTeamRoster(config.agentId),
      findings: await this.findingsBoard.getRecent(15),
      processContext: config.processContext,
    });
  }

  /**
   * Core session loop — iterates messages from query(), emitting events.
   */
  private async runSession(session: ActiveSession): Promise<void> {
    const { config, abortController } = session;
    const { allowedTools, permissionMode } = PERMISSION_MAP[config.permissionLevel];
    const systemPrompt = await this.buildPromptForSession(session);

    try {
      const mcpServer = config.processContext
        ? createBrainstormMcpServer(config.agentId, this.toolHandler)
        : createRpgMcpServer(config.agentId, this.toolHandler);
      const q = query({
        prompt: config.mission,
        options: {
          systemPrompt,
          cwd: config.repoPath,
          env: cleanEnv(),
          allowedTools,
          permissionMode: permissionMode as any,
          allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
          abortController,
          maxTurns: 50,
          mcpServers: { rpg: mcpServer },
          stderr: (data: string) => {
            if (data.trim()) {
              console.error(`[Agent:${config.agentId}:stderr] ${data.trim()}`);
            }
          },
        },
      });

      session.status = 'running';

      await this.consumeMessages(session, q);
    } catch (err) {
      if (!abortController.signal.aborted) {
        this.emit('agent:error', config.agentId, err);
      }
    } finally {
      try {
        await session.vault.save();
      } catch {
        // Best-effort save
      }
      if (session.status !== 'stopped') {
        session.status = 'idle';
        this.emit('agent:idle', config.agentId);
        this.drainPendingPrompts(session);
      }
    }
  }

  /**
   * Resumed session loop — resumes an existing session with a new prompt.
   */
  private async runResumedSession(
    session: ActiveSession,
    prompt: string,
  ): Promise<void> {
    const { config, abortController } = session;
    const { allowedTools, permissionMode } = PERMISSION_MAP[config.permissionLevel];
    const systemPrompt = await this.buildPromptForSession(session);

    try {
      const mcpServer = config.processContext
        ? createBrainstormMcpServer(config.agentId, this.toolHandler)
        : createRpgMcpServer(config.agentId, this.toolHandler);
      const q = query({
        prompt,
        options: {
          systemPrompt,
          cwd: config.repoPath,
          env: cleanEnv(),
          allowedTools,
          permissionMode: permissionMode as any,
          allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
          abortController,
          resume: session.sessionId,
          maxTurns: 50,
          mcpServers: { rpg: mcpServer },
          stderr: (data: string) => {
            if (data.trim()) {
              console.error(`[Agent:${config.agentId}:stderr] ${data.trim()}`);
            }
          },
        },
      });

      session.status = 'running';

      await this.consumeMessages(session, q);
    } catch (err) {
      if (!abortController.signal.aborted) {
        this.emit('agent:error', config.agentId, err);
      }
    } finally {
      try {
        await session.vault.save();
      } catch {
        // Best-effort save
      }
      if (session.status !== 'stopped') {
        session.status = 'idle';
        this.emit('agent:idle', config.agentId);
        this.drainPendingPrompts(session);
      }
    }
  }

  /**
   * Shared message-consumption loop used by both initial and resumed sessions.
   */
  private async consumeMessages(
    session: ActiveSession,
    q: AsyncGenerator<SDKMessage, void>,
  ): Promise<void> {
    const { config, abortController } = session;

    for await (const message of q) {
      // Break early if aborted
      if (abortController.signal.aborted) {
        break;
      }

      // Capture sessionId from the init system message
      if (
        message.type === 'system' &&
        (message as SDKSystemMessage).subtype === 'init'
      ) {
        session.sessionId = (message as SDKSystemMessage).session_id;
      }

      // Capture sessionId from any message that carries one
      if ('session_id' in message && (message as any).session_id) {
        session.sessionId = (message as any).session_id;
      }

      // Emit every message for upstream consumers
      this.emit('agent:message', config.agentId, message);

      // Emit completion on result messages
      if (message.type === 'result') {
        this.emit('agent:complete', config.agentId, message as SDKResultMessage);
      }
    }
  }
}
