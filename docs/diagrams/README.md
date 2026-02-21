# Agent Dungeon: System Diagrams

Visual documentation for onboarding new agent sessions and understanding key flows.

## Diagram Index

| Document | What It Covers |
|----------|---------------|
| [System Overview](system-overview.md) | High-level architecture, component boundaries, message protocol |
| [Agent Lifecycle](agent-lifecycle.md) | Spawning, session states, shutdown, and dismissal flows |
| [Agent Communication](agent-communication.md) | How agents talk to each other, share findings, request help, and coordinate |
| [Brainstorm Process](brainstorm-process.md) | Stage-by-stage flow, agent personas, groupthink prevention, human gates |
| [Client Rendering](client-rendering.md) | Screen flow, scene lifecycle, data flow from WebSocket to pixels |
| [Data & Persistence](data-persistence.md) | Knowledge vaults, findings board, realm registry, transcript logs |

## Quick Start for New Agent Sessions

If you're a new agent session ramping up on this codebase, read these in order:

1. **System Overview** to understand the three-process architecture
2. **Agent Lifecycle** to understand how agents are born, work, and die
3. **Agent Communication** to understand how agents coordinate
4. **Brainstorm Process** if you're working on the brainstorming skill

## Conventions

- All diagrams use Mermaid (renders natively in Obsidian and GitHub)
- Vertical orientation (`graph TD`) preferred over horizontal
- Sequence diagrams for temporal flows, state diagrams for lifecycles
