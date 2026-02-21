/**
 * Logs every SDK message from agent sessions to JSONL transcript files.
 * Files are written to `.agent-rpg/logs/{agent_id}/{date}.jsonl`.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sanitizePathComponent } from './PathSafety.js';
import type { ITranscriptLogger } from './interfaces/index.js';

export class TranscriptLogger implements ITranscriptLogger {
  private repoPath: string;
  private dateStr: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Append a message to an agent's transcript log.
   */
  async log(agentId: string, message: unknown): Promise<void> {
    const safeAgentId = sanitizePathComponent(agentId);
    const dir = join(this.repoPath, '.agent-rpg', 'logs', safeAgentId);
    const filePath = join(dir, `${this.dateStr}.jsonl`);

    try {
      await mkdir(dir, { recursive: true });
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        agent_id: agentId,
        message,
      }) + '\n';
      await appendFile(filePath, line, 'utf-8');
    } catch (err) {
      // Non-fatal — log to console but don't crash
      console.error(`[TranscriptLogger] Failed to log for ${agentId}:`, err);
    }
  }

  /**
   * Read all transcript entries for an agent from today's log file.
   * Returns an empty array if the file doesn't exist.
   * Malformed JSONL lines are silently skipped.
   */
  async readTranscript(agentId: string): Promise<Array<{ timestamp: string; agent_id: string; message: unknown }>> {
    const safeAgentId = sanitizePathComponent(agentId);
    const dir = join(this.repoPath, '.agent-rpg', 'logs', safeAgentId);
    const filePath = join(dir, `${this.dateStr}.jsonl`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const entries: Array<{ timestamp: string; agent_id: string; message: unknown }> = [];

      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }

      return entries;
    } catch {
      return [];
    }
  }
}
