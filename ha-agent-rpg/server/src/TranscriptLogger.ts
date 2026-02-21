/**
 * Logs every SDK message from agent sessions to JSONL transcript files.
 * Files are written to `.agent-rpg/logs/{agent_id}/{date}.jsonl`.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export class TranscriptLogger {
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
    const dir = join(this.repoPath, '.agent-rpg', 'logs', agentId);
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
}
