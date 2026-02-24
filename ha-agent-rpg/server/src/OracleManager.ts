/**
 * OracleManager — manages the Oracle agent lifecycle.
 *
 * The Oracle is a special "session leader" agent that:
 * 1. Receives the user's problem/repo input
 * 2. Decides which hero agents to summon (via SelectHeroes tool)
 * 3. Can adjust the party between stages (via SummonReinforcement / DismissHero)
 * 4. Compiles the final report (via PresentReport)
 *
 * Emitted events:
 *   oracle:decision  — Oracle called SelectHeroes (data forwarded from CustomToolHandler)
 *   oracle:summon    — Oracle called SummonReinforcement
 *   oracle:dismiss   — Oracle called DismissHero
 *   oracle:report    — Oracle called PresentReport
 */

import { EventEmitter } from 'node:events';
import type { AgentSessionManager } from './AgentSessionManager.js';
import type { CustomToolHandler } from './CustomToolHandler.js';
import type { FindingsBoard } from './FindingsBoard.js';
import type { OracleContext } from './SystemPromptBuilder.js';

export interface OracleSpawnConfig {
  repoPath: string;
  problem?: string;
  repoInput?: string;
  permissionLevel: 'read-only' | 'write-with-approval' | 'full';
}

export class OracleManager extends EventEmitter {
  private sessionManager: AgentSessionManager;
  private toolHandler: CustomToolHandler;
  private findingsBoard: FindingsBoard;
  private active = false;
  private spawnConfig: OracleSpawnConfig | null = null;

  constructor(
    sessionManager: AgentSessionManager,
    toolHandler: CustomToolHandler,
    findingsBoard: FindingsBoard,
  ) {
    super();
    this.sessionManager = sessionManager;
    this.toolHandler = toolHandler;
    this.findingsBoard = findingsBoard;
    this.wireToolEvents();
  }

  /**
   * Spawn the Oracle agent. Throws if Oracle is already active.
   */
  async spawn(config: OracleSpawnConfig): Promise<void> {
    if (this.active) {
      throw new Error('Oracle is already active');
    }
    this.spawnConfig = config;
    this.active = true;

    const parts: string[] = [];
    if (config.problem) parts.push(`Problem: ${config.problem}`);
    if (config.repoInput) parts.push(`Repository: ${config.repoInput}`);
    const inputDescription = parts.join('\n');

    const oracleContext: OracleContext = {
      userProblem: config.problem,
      userRepoInput: config.repoInput,
      availableRoles: [],
      availableTemplates: [],
      phase: 'analysis',
    };

    await this.sessionManager.spawnAgent({
      agentId: 'oracle',
      agentName: 'The Oracle',
      role: 'Session Leader',
      realm: '/',
      mission: `Analyze the user's submission and decide which heroes to summon.\n\nUSER INPUT:\n${inputDescription}\n\nCall SelectHeroes when you have decided.`,
      repoPath: config.repoPath,
      permissionLevel: config.permissionLevel,
      oracleContext,
      model: 'opus',
    });
  }

  /**
   * Returns true if the Oracle agent session is currently active.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Dismiss the Oracle agent and clean up state.
   */
  async dismiss(): Promise<void> {
    if (!this.active) return;
    await this.sessionManager.dismissAgent('oracle');
    this.active = false;
    this.spawnConfig = null;
  }

  /**
   * Send an inter-stage context update to the Oracle so it can adjust the
   * hero party between process stages.
   */
  async feedInterStageContext(completedStageName: string, nextStageName: string): Promise<void> {
    if (!this.active) return;

    const findings = await this.findingsBoard.getRecent(30);
    const findingsSummary = findings
      .map((f) => `- [${f.agent_name}] ${f.finding}`)
      .join('\n');

    const prompt = `[INTER-STAGE UPDATE] Stage "${completedStageName}" is complete. Next stage: "${nextStageName}".

FINDINGS SO FAR:
${findingsSummary || '(none yet)'}

Review the findings. You may:
- Call SummonReinforcement to add a hero for the next stage
- Call DismissHero to remove a hero that is no longer needed
- Or do nothing if the party composition is fine

The next stage will begin after you respond.`;

    await this.sessionManager.sendFollowUp('oracle', prompt);
  }

  /**
   * Returns the spawn configuration used when the Oracle was last started.
   */
  getSpawnConfig(): OracleSpawnConfig | null {
    return this.spawnConfig;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Wire CustomToolHandler oracle:* events through as OracleManager events.
   * This is called once in the constructor.
   */
  private wireToolEvents(): void {
    this.toolHandler.on('oracle:select-heroes', (data: unknown) => {
      this.emit('oracle:decision', data);
    });
    this.toolHandler.on('oracle:summon-reinforcement', (data: unknown) => {
      this.emit('oracle:summon', data);
    });
    this.toolHandler.on('oracle:dismiss-hero', (data: unknown) => {
      this.emit('oracle:dismiss', data);
    });
    this.toolHandler.on('oracle:present-report', (data: unknown) => {
      this.emit('oracle:report', data);
    });
  }
}
