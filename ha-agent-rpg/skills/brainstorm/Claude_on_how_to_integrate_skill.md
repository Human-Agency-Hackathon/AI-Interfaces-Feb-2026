⏺ The skill document is at skills/brainstorm/SKILL.md. Here's what it gives you:
  
  The core flow:                                                                
  topic → 4 provocations → 4 parallel agents (separate rooms) → 40 ideas
       → ≤10 clusters → 3 finalists (scored) → 1 winner → full articulation     
                                                                                
  Key design decisions:

  - Self-contained — the orchestrator reads its own mission and executes all 5
  phases without needing any code changes. It uses the existing SummonAgent and
  PostFindings MCP tools already in the system.
  - Speed-first — the bottleneck is agent API latency, not the logic. The
  document includes a timing budget (~2.5-3 min) and a "tuning for speed"
  section to cut it down if needed (e.g. 5 ideas instead of 10).
  - Rooms are realms — subagents get realm="/brainstorm/room-1" etc., so they
  visually appear in separate rooms in the Phaser client with zero extra wiring.
  - PostFindings as the coordination bus — agents post their ideas, orchestrator
   reads them from the findings board. No synchronous waiting needed.

  To run it: spawn the Brainstorm Conductor with the mission from the
  ORCHESTRATOR_MISSION block, filling in {{TOPIC}}. That's all — the
  orchestrator drives the rest.

  One thing to confirm with your teammate: does the current system support
  spawning agents with realm paths that don't correspond to real directories?
  The KnowledgeVault uses repoPath as a base, but the realm itself is just a
  label — so /brainstorm/room-1 should work as a display label even with no
  actual files there.

