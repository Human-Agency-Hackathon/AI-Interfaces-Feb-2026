export interface TranscriptEntry {
  timestamp: string;
  agent_id: string;
  message: unknown;
}

export interface ITranscriptLogger {
  log(agentId: string, message: unknown): Promise<void>;
  readTranscript(agentId: string): Promise<TranscriptEntry[]>;
}
