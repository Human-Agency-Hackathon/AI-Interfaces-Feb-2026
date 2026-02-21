/**
 * ProcessController — manages stage lifecycle for a running brainstorming process.
 *
 * Responsibilities:
 * - Track agent turns within a stage
 * - Evaluate completion criteria (turn_count or explicit_signal)
 * - Advance to the next stage: dismiss agents, update WorldState, spawn next set
 * - Emit events so BridgeServer can broadcast stage transitions to clients
 *
 * BridgeServer owns spawning/dismissing; this class calls back via the provided
 * delegate functions to keep BridgeServer as the single owner of agent sessions.
 */

import { EventEmitter } from 'node:events';
import type { ProcessDefinition, StageDefinition } from './ProcessTemplates.js';

export interface StageContext {
  problem: string;
  template: ProcessDefinition;
  stageIndex: number;
}

export interface ProcessControllerDelegate {
  /** Dismiss all agents belonging to the given stage */
  dismissStageAgents(stage: StageDefinition): Promise<void>;
  /** Spawn agents for the given stage */
  spawnStageAgents(template: ProcessDefinition, stageIndex: number, problem: string): Promise<void>;
  /** Broadcast a message to all connected clients */
  broadcast(msg: Record<string, unknown>): void;
  /** Save an artifact produced during this stage */
  saveArtifact(stageId: string, artifactId: string, content: string): void;
  /** Advance WorldState to the next stage (persists currentStageIndex) */
  onStageAdvanced(completedStageId: string, artifacts: Record<string, string>): void;
  /** Send a follow-up prompt to an agent (for sequential turn driving) */
  sendFollowUp(agentId: string, prompt: string): Promise<void>;
}

export type ProcessControllerEvent =
  | { type: 'stage:started'; stageId: string; stageName: string; stageIndex: number; totalStages: number }
  | { type: 'stage:completed'; stageId: string; stageName: string }
  | { type: 'process:completed'; processId: string; problem: string }

export class ProcessController extends EventEmitter {
  private context: StageContext | null = null;
  private delegate: ProcessControllerDelegate;
  private stageTurnCounts: Map<string, number> = new Map();
  private advancing = false; // guard against concurrent advance calls

  constructor(delegate: ProcessControllerDelegate) {
    super();
    this.delegate = delegate;
  }

  /**
   * Start the controller for a new process. Assumes agents for stage 0
   * have already been spawned by BridgeServer.
   */
  start(problem: string, template: ProcessDefinition): void {
    this.context = { problem, template, stageIndex: 0 };
    this.stageTurnCounts.clear();
    this.advancing = false;
    const stage = template.stages[0];
    if (stage) {
      this.emit('stage:started', {
        type: 'stage:started',
        stageId: stage.id,
        stageName: stage.name,
        stageIndex: 0,
        totalStages: template.stages.length,
      } as ProcessControllerEvent);
    }
  }

  /**
   * Called by BridgeServer whenever an agent completes a turn (agent:idle event).
   * Increments the stage turn counter, drives sequential turns, and checks completion.
   */
  async onAgentTurnComplete(agentId: string): Promise<void> {
    if (!this.context || this.advancing) return;
    const { template, stageIndex } = this.context;
    const stage = template.stages[stageIndex];
    if (!stage) return;

    // Only count turns from agents belonging to this stage
    if (!stage.roles.includes(agentId)) return;

    const count = (this.stageTurnCounts.get(stage.id) ?? 0) + 1;
    this.stageTurnCounts.set(stage.id, count);

    const limit = stage.completionCriteria.type === 'turn_count' ? stage.completionCriteria.turns : '∞';
    console.log(`[ProcessController] Stage "${stage.name}" turn count: ${count}/${limit}`);

    if (this.isStageComplete(stage, count)) {
      await this.advanceStage();
      return;
    }

    // Drive the next agent for sequential turn structures
    await this.driveNextSequentialAgent(stage, agentId, count);
  }

  /**
   * Called by BridgeServer when an agent explicitly signals stage completion
   * (via the CompleteStage MCP tool). Triggers immediate advancement.
   */
  async onExplicitStageComplete(agentId: string, artifacts: Record<string, string> = {}): Promise<void> {
    if (!this.context || this.advancing) return;
    const { template, stageIndex } = this.context;
    const stage = template.stages[stageIndex];
    if (!stage) return;

    // Only the facilitator or any stage participant can signal completion
    if (!stage.roles.includes(agentId)) return;

    console.log(`[ProcessController] Agent "${agentId}" explicitly completed stage "${stage.name}"`);

    // Persist any provided artifacts
    for (const [artifactId, content] of Object.entries(artifacts)) {
      this.delegate.saveArtifact(stage.id, artifactId, content);
    }

    await this.advanceStage();
  }

  /** Returns the current stage or null if no process is running */
  getCurrentStage(): StageDefinition | null {
    if (!this.context) return null;
    return this.context.template.stages[this.context.stageIndex] ?? null;
  }

  /** Returns the full context or null */
  getContext(): StageContext | null {
    return this.context;
  }

  /** Stop the controller (e.g. user quit or error) */
  stop(): void {
    this.context = null;
    this.stageTurnCounts.clear();
    this.advancing = false;
  }

  // ── Private ──

  /**
   * For sequential turn structures, prompt the next agent in the order after
   * the current one finishes. Wraps around when the sequence reaches the end.
   */
  private async driveNextSequentialAgent(
    stage: StageDefinition,
    completedAgentId: string,
    _turnCount: number,
  ): Promise<void> {
    if (stage.turnStructure.type !== 'sequential') return;
    const order = stage.turnStructure.order;
    if (order.length === 0) return;

    const currentIdx = order.indexOf(completedAgentId);
    if (currentIdx === -1) return;

    const nextIdx = (currentIdx + 1) % order.length;
    const nextAgentId = order[nextIdx];

    try {
      await this.delegate.sendFollowUp(
        nextAgentId,
        `[PROCESS TURN] It's your turn. The previous participant just finished. Continue the ${stage.name} stage — contribute your perspective and use PostFindings to share ideas with the group.`,
      );
    } catch (err) {
      console.error(`[ProcessController] Failed to send follow-up to "${nextAgentId}":`, err);
    }
  }

  private isStageComplete(stage: StageDefinition, turnCount: number): boolean {
    const criteria = stage.completionCriteria;
    if (criteria.type === 'turn_count') {
      return turnCount >= criteria.turns;
    }
    // explicit_signal: never auto-completes; relies on onExplicitStageComplete
    return false;
  }

  private async advanceStage(): Promise<void> {
    if (!this.context || this.advancing) return;
    this.advancing = true;

    const { problem, template, stageIndex } = this.context;
    const currentStage = template.stages[stageIndex];
    const nextIndex = stageIndex + 1;
    const nextStage = template.stages[nextIndex];

    // Update WorldState to record stage advancement
    this.delegate.onStageAdvanced(currentStage.id, {});

    this.emit('stage:completed', {
      type: 'stage:completed',
      stageId: currentStage.id,
      stageName: currentStage.name,
    } as ProcessControllerEvent);

    this.delegate.broadcast({
      type: 'stage:advanced',
      completedStageId: currentStage.id,
      completedStageName: currentStage.name,
      nextStageId: nextStage?.id ?? null,
      nextStageName: nextStage?.name ?? null,
    });

    if (!nextStage) {
      // Process complete
      this.context = null;
      this.emit('process:completed', {
        type: 'process:completed',
        processId: template.id,
        problem,
      } as ProcessControllerEvent);
      this.delegate.broadcast({
        type: 'stage:completed',
        processId: template.id,
        problem,
        message: 'Brainstorming session complete.',
      });
      this.advancing = false;
      return;
    }

    // Dismiss current stage agents, update context, spawn next stage
    try {
      await this.delegate.dismissStageAgents(currentStage);
    } catch (err) {
      console.error('[ProcessController] Error dismissing agents:', err);
    }

    this.context = { problem, template, stageIndex: nextIndex };
    this.advancing = false;

    try {
      await this.delegate.spawnStageAgents(template, nextIndex, problem);
    } catch (err) {
      console.error('[ProcessController] Error spawning next stage agents:', err);
      this.emit('error', err);
      return;
    }

    this.emit('stage:started', {
      type: 'stage:started',
      stageId: nextStage.id,
      stageName: nextStage.name,
      stageIndex: nextIndex,
      totalStages: template.stages.length,
    } as ProcessControllerEvent);
  }
}
