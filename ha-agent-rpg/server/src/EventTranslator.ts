/**
 * Translates Claude Agent SDK streaming messages into RPG visualization events.
 *
 * Handles two message shapes:
 *   1. `stream_event` — real-time streaming chunks (content_block_start, delta, stop)
 *   2. `assistant`    — complete assistant turn messages with content arrays
 */

import { basename } from 'node:path';
import type { MapObject } from './types.js';

// ── Public types ──

export interface RPGEvent {
  type: 'move_to_file' | 'interact_file' | 'speak' | 'think' | 'emote' | 'skill_effect' | 'activity';
  agent_id: string;
  data: Record<string, unknown>;
}

// ── Translator ──

export class EventTranslator {
  /** Which tool is currently in-flight for each agent (keyed by agentId). */
  private currentToolByAgent: Map<string, string> = new Map();

  /** Accumulated text deltas that will be flushed as a single `speak` event. */
  private textBufferByAgent: Map<string, string> = new Map();

  /** Current map objects used for file-path to MapObject resolution. */
  private objects: MapObject[] = [];

  // ── Public API ──

  /** Replace the current set of map objects (called when the world state changes). */
  setObjects(objects: MapObject[]): void {
    this.objects = objects;
  }

  /**
   * Main entry point.  Receives a raw SDK message and returns zero or more
   * RPG events that should be broadcast to connected clients.
   */
  translate(agentId: string, message: any): RPGEvent[] {
    if (!message || typeof message !== 'object') return [];

    if (message.type === 'stream_event') {
      return this.handleStreamEvent(agentId, message.event);
    }

    if (message.type === 'assistant') {
      return this.handleAssistantMessage(agentId, message);
    }

    return [];
  }

  /**
   * Attempt to find a MapObject whose label or metadata.fullPath matches the
   * given file path.  Returns `null` when no match is found.
   */
  findObjectForFile(filePath: string): MapObject | null {
    if (!filePath) return null;

    const base = basename(filePath);

    // 1. Exact label match on the file basename.
    for (const obj of this.objects) {
      if (obj.label === base) return obj;
    }

    // 2. Partial path match against metadata.fullPath.
    for (const obj of this.objects) {
      const fullPath = obj.metadata?.fullPath;
      if (typeof fullPath === 'string' && fullPath.includes(filePath)) return obj;
    }

    // 3. Check if the filePath ends with part of the fullPath or vice-versa.
    for (const obj of this.objects) {
      const fullPath = obj.metadata?.fullPath;
      if (typeof fullPath === 'string' && filePath.includes(fullPath)) return obj;
    }

    return null;
  }

  // ── Stream event handling ──

  private handleStreamEvent(agentId: string, event: any): RPGEvent[] {
    if (!event || typeof event !== 'object') return [];

    switch (event.type) {
      case 'content_block_start':
        return this.handleContentBlockStart(agentId, event);
      case 'content_block_delta':
        return this.handleContentBlockDelta(agentId, event);
      case 'content_block_stop':
        return this.handleContentBlockStop(agentId);
      default:
        return [];
    }
  }

  private handleContentBlockStart(agentId: string, event: any): RPGEvent[] {
    if (event.content_block?.type === 'tool_use') {
      const toolName: string = event.content_block.name ?? 'unknown';
      this.currentToolByAgent.set(agentId, toolName);
      return this.eventsForTool(agentId, toolName);
    }
    return [];
  }

  private handleContentBlockDelta(agentId: string, event: any): RPGEvent[] {
    if (event.delta?.type === 'text_delta' && typeof event.delta.text === 'string') {
      const existing = this.textBufferByAgent.get(agentId) ?? '';
      this.textBufferByAgent.set(agentId, existing + event.delta.text);
    }
    return [];
  }

  private handleContentBlockStop(agentId: string): RPGEvent[] {
    const events: RPGEvent[] = [];

    // Clear the current tool for this agent.
    this.currentToolByAgent.delete(agentId);

    // Flush accumulated text as a single speak event.
    const text = this.textBufferByAgent.get(agentId);
    if (text && text.trim().length > 0) {
      events.push({
        type: 'speak',
        agent_id: agentId,
        data: { text: text.trim() },
      });
    }
    this.textBufferByAgent.delete(agentId);

    return events;
  }

  // ── Assistant (non-streaming) message handling ──

  private handleAssistantMessage(agentId: string, message: any): RPGEvent[] {
    const content = message.message?.content;
    if (!Array.isArray(content)) return [];

    const events: RPGEvent[] = [];

    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0) {
        events.push({
          type: 'speak',
          agent_id: agentId,
          data: { text: block.text.trim() },
        });
      } else if (block.type === 'tool_use') {
        const toolName: string = block.name ?? 'unknown';
        events.push(...this.eventsForTool(agentId, toolName));
      }
    }

    return events;
  }

  // ── Tool → RPG event mapping ──

  private eventsForTool(agentId: string, toolName: string): RPGEvent[] {
    switch (toolName) {
      case 'Read':
        return [
          { type: 'think', agent_id: agentId, data: { text: 'Reading file...' } },
        ];

      case 'Edit':
      case 'Write':
        return [
          { type: 'skill_effect', agent_id: agentId, data: { text: 'Writing code...' } },
        ];

      case 'Bash':
        return [
          { type: 'emote', agent_id: agentId, data: { emote: 'exclamation' } },
          { type: 'activity', agent_id: agentId, data: { text: 'Running command...' } },
        ];

      case 'Grep':
      case 'Glob':
        return [
          { type: 'think', agent_id: agentId, data: { text: 'Searching codebase...' } },
        ];

      case 'SummonAgent':
        return [
          { type: 'speak', agent_id: agentId, data: { text: 'I need to summon a specialist...' } },
        ];

      case 'RequestHelp':
        return [
          { type: 'speak', agent_id: agentId, data: { text: 'Requesting help from a teammate...' } },
        ];

      case 'PostFindings':
        return [
          { type: 'speak', agent_id: agentId, data: { text: 'Sharing findings with the team...' } },
        ];

      default:
        return [
          { type: 'activity', agent_id: agentId, data: { text: `Using ${toolName}...` } },
        ];
    }
  }
}
