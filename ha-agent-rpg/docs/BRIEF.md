# Agent Dungeon - Project Brief

**Project Name:** Agent Dungeon (HA Agent RPG)
**Version:** 1.0.0
**Status:** Active Development
**Parent Project:** AI Interfaces (February 2026)

---

## Vision

Transform codebase exploration and AI agent collaboration into an **engaging visual experience** by rendering autonomous AI agents as characters in a classic JRPG game world.

Agent Dungeon makes the invisible visible — every file read, code search, and collaborative discussion appears as movement, dialogue, and interaction in a 2D pixel art world.

---

## The Problem

Current AI agent development tools suffer from poor observability:

1. **Black Box Problem** - Developers can't see what agents are doing in real-time
2. **Collaboration Opacity** - Multi-agent systems lack visual coordination mechanisms
3. **Engagement Gap** - Watching logs scroll by is boring and unintuitive
4. **Context Loss** - Hard to understand agent spatial reasoning (file locations, directory structure)
5. **Trust Deficit** - Users don't trust what they can't see

Traditional solutions (logs, dashboards, CLI output) fail to make agent behavior **intuitive and engaging**.

---

## The Solution

**Agent Dungeon** renders AI agent activity as a real-time JRPG game where:

- **Directories become dungeon rooms** - Each folder is a procedurally-generated map
- **Files become interactive objects** - Source files, configs, and docs appear as in-game items
- **Agent actions become animations** - Reading code shows "searching" animations, writing code shows "crafting" effects
- **Collaboration becomes visible** - Agents can summon specialists, share findings, and coordinate via speech bubbles
- **GitHub issues become quests** - Open issues appear as quest markers with difficulty ratings
- **Knowledge becomes XP** - Agents level up expertise in different areas (Testing, Architecture, etc.)

The game is a **pure visualization layer** — agents run via Claude Agent SDK with full access to real tools (Read, Edit, Bash, etc.). The game simply makes their work visible and engaging.

---

## Core Design Principles

### 1. **Visual-First Observability**
Every agent action should have a clear, immediate visual representation. No "hidden" operations.

### 2. **Zero Image Assets**
All graphics generated programmatically (Phaser textures). This allows dynamic theming, agent customization, and zero asset management overhead.

### 3. **Pure Renderer Architecture**
The game client is **read-only**. It receives state from the server but never sends actions. All game logic lives server-side.

### 4. **Collaborative by Default**
Agents can summon specialists, share discoveries, and coordinate. Collaboration is a first-class feature, not an afterthought.

### 5. **Respect Real Workflows**
Agents use real dev tools (Bash, Git, npm) in sandboxed environments. The game doesn't abstract away reality — it visualizes it.

### 6. **Spatial Reasoning Metaphor**
Codebases are spatial — files exist in directories, imports connect modules. The dungeon map makes this spatial structure explicit.

---

## Target Audience

### Primary Users

1. **AI Researchers** - Studying multi-agent collaboration, agent reasoning patterns
2. **LLM Application Developers** - Building agent systems, need better debugging tools
3. **Open Source Maintainers** - Want to deploy autonomous agents on their repos for triage, documentation, testing
4. **Educators** - Teaching AI agent concepts in an intuitive, visual way

### Secondary Users

5. **Content Creators** - Streaming agent "adventures" through codebases
6. **Game Developers** - Interested in procedural generation and AI-driven NPCs
7. **Developer Tool Enthusiasts** - Seeking novel ways to visualize code

---

## Use Cases

### 1. **Codebase Onboarding** (Canonical Use Case)
**Scenario:** Developer joins a new project with 50k+ lines of unfamiliar code.

**Traditional Approach:** Read docs, grep files, ask teammates questions over days/weeks.

**Agent Dungeon Approach:**
- Summon "The Oracle" agent (Architecture specialist, realm: /)
- Watch Oracle explore the codebase visually — walking through directories, reading key files
- Oracle posts findings to a shared board visible in-game
- Oracle summons specialists (Test Guardian for /tests, API Scout for /api)
- Specialists collaborate, share knowledge
- Developer sees the entire exploration in 30 minutes as a visual story

**Outcome:** Developer understands architecture 10x faster, has expert findings saved to knowledge vault.

---

### 2. **Bug Hunt Speedrun**
**Scenario:** Production bug reported, need to find root cause quickly.

**Approach:**
- Link GitHub issue as a quest
- Summon "Bug Hunter" agent
- Watch agent explore codebase, read stack traces, identify suspects
- Agent posts findings ("High: Auth middleware missing null check on line 47")
- Human verifies and fixes

**Outcome:** Bug located in minutes vs hours of manual searching.

---

### 3. **Test Coverage Campaign**
**Scenario:** Team wants to improve test coverage from 60% → 80%.

**Approach:**
- Summon "Test Guardian" agent for each major module
- Agents claim quests (GitHub issues for untested modules)
- Watch agents write tests, run coverage reports
- Agents coordinate to avoid duplicate work
- Human reviews PRs, agents iterate based on feedback

**Outcome:** Systematic test coverage improvement with full audit trail.

---

### 4. **Documentation Sprint**
**Scenario:** OSS project has minimal docs, maintainers too busy.

**Approach:**
- Summon "Doc Scribe" agent (realm: /)
- Agent audits existing docs, identifies gaps
- Agent writes READMEs, API references, architecture guides
- Posts findings to team board for human review
- Human approves, agent commits changes

**Outcome:** Comprehensive documentation generated in days vs months.

---

### 5. **Multi-Agent Research**
**Scenario:** Researcher studying agent collaboration patterns.

**Approach:**
- Spawn 5 agents with different specialties
- Give them a complex codebase to explore
- Record full transcript (every tool use, every thought)
- Analyze collaboration patterns: Who summons whom? What knowledge is shared?
- Publish research on emergent coordination behaviors

**Outcome:** Novel insights into LLM agent collaboration.

---

## Relationship to AI Interfaces Project

**Agent Dungeon** is the **first experiment** in the "AI Interfaces - February 2026" umbrella project.

### The Umbrella Project Goal
Explore novel interfaces for human-AI interaction beyond chat. Questions:
- How can spatial metaphors improve AI observability?
- What game design patterns apply to AI agent UX?
- Can visualization reduce the "trust gap" in autonomous systems?

### Why Start with a JRPG?
JRPGs have solved many problems relevant to agent systems:
- **Turn-based actions** - Natural fit for LLM round-trip delays
- **Party management** - Proven UI patterns for coordinating multiple characters
- **Quest systems** - Structured goal tracking (maps to GitHub issues)
- **Dialogue systems** - Expressive communication between characters
- **Leveling systems** - Visible progression and expertise growth
- **Spatial exploration** - Making abstract file hierarchies concrete

### Future AI Interfaces Experiments
- Real-time strategy game for agent orchestration
- Visual novel for agent-human pair programming
- Puzzle game for agent problem-solving
- City builder for agent-managed services

Agent Dungeon validates core concepts (WebSocket architecture, procedural generation, MCP tools) that future experiments will build upon.

---

## Success Criteria

### Technical Metrics
- ✅ Agent sessions run stably for 1+ hour without crashes
- ✅ WebSocket protocol handles 10+ concurrent agents
- ✅ Client renders 60 FPS with 5 active agents
- ✅ Knowledge vault persists across sessions
- ✅ MCP tools execute reliably (SummonAgent, PostFindings, etc.)

### User Experience Metrics
- ✅ New users complete codebase onboarding in <10 minutes
- ✅ Users can understand agent actions without reading logs
- ✅ Collaboration visualizations make multi-agent work intuitive
- ✅ Quest system successfully maps to real GitHub issues

### Research Metrics
- ✅ Full transcript logging enables reproducible research
- ✅ Agent coordination patterns are observable and measurable
- ✅ Knowledge vault data enables expertise growth analysis
- ✅ Findings board enables team learning studies

### Community Metrics
- ⏳ 100+ GitHub stars (validate interest)
- ⏳ 10+ external contributors
- ⏳ 5+ research papers cite the project
- ⏳ 3+ demo videos/streams showcasing agent adventures

---

## Current Status (Feb 2026)

### ✅ Completed
- Bridge server with WebSocket hub
- Phaser client with procedural textures
- Claude Agent SDK integration
- 6 custom MCP tools (SummonAgent, PostFindings, etc.)
- Hierarchical dungeon maps (directory → rooms)
- Realm persistence and tracking
- Quest system (GitHub issues)
- Knowledge vault per agent
- Findings board for team sharing
- Comprehensive test suite (209 server tests)
- CI/CD pipeline with Codecov

### 🚧 In Progress
- Oracle agent system prompt tuning (Behrang)
- Multi-agent orchestration (Behrang)
- Room architecture refactor (Behrang - agents need own rooms vs 1:1 folder mapping)
- Pixel art skinning for agents (Ida)
- Redis migration for agent memory (Pratham)

### 📋 Planned (High Priority - see TASKS.md)
- Claude Agent SDK session verification with real API keys
- End-to-end flow validation (repo → analysis → map → exploration)
- Client-side testing (currently minimal: 1 test file)
- Error handling for failed repo analysis
- Graceful SDK session disconnect handling
- Loading states during repo analysis

### 📋 Planned (Medium Priority)
- Manual mode (player control flow)
- Supervised mode (approval UI for agent actions)
- Write-with-approval permission level
- Non-GitHub repo support (GitLab, Bitbucket)
- Session replay from transcript logs

### 📋 Future Vision
- Public deployment with authentication
- Agent marketplace (community-contributed specialist agents)
- Real-time multiplayer (multiple humans watching same agents)
- Agent tournaments (which agent solves bug fastest?)
- VR mode for immersive codebase exploration

---

## Technology Stack Rationale

### Why Phaser 3?
- **Mature game engine** with excellent TypeScript support
- **Canvas rendering** = no GPU requirements, works everywhere
- **Programmatic textures** = zero asset management
- **Large ecosystem** of plugins and examples
- **Proven at scale** (used in production games)

### Why WebSocket?
- **Real-time bidirectional** communication needed
- **Lower latency** than HTTP polling
- **Native browser support** (no extra deps)
- **Simple protocol** easy to implement in any language

### Why Claude Agent SDK?
- **Pre-built agentic loop** (thought → action → result)
- **Built-in tool support** (Read, Edit, Bash, Grep, Glob)
- **Transcript logging** automatic
- **Permission system** (read-only, write-with-approval, full)
- **Production-ready** (built by Anthropic)

### Why TypeScript?
- **Type safety** catches bugs before runtime
- **Shared types** (shared/protocol.ts) across server/client
- **Better IDE support** for complex game logic
- **Refactoring confidence** when changing architecture

### Why Node.js Server?
- **Same language** as client (code reuse)
- **Fast iteration** with tsx watch mode
- **Excellent WebSocket libraries** (ws)
- **Easy deployment** (single process, no complex setup)

---

## Design Decisions

### Why Turn-Based (Not Real-Time)?
LLMs have 1-5 second latencies. Real-time would feel laggy. Turn-based makes latency a feature, not a bug.

### Why Pure Renderer Client?
Prevents desync bugs. Server is source of truth. Client just displays state. Simplifies multiplayer later.

### Why Procedural Textures?
Zero asset management. Instant agent customization (any color). Easy to theme. Faster iteration.

### Why Hierarchical Maps (Not Flat)?
Large codebases have thousands of files. Flat maps don't scale. Hierarchical dungeons make navigation intuitive.

### Why Custom MCP Tools?
Agents need domain-specific tools for collaboration (SummonAgent, PostFindings). Standard SDK tools don't cover this.

### Why Knowledge Vault Persistence?
Agents should "remember" what they learned. Enables expertise growth over time. Supports research on agent learning.

---

## Risks and Mitigations

### Risk 1: Claude SDK API Costs
**Mitigation:** Token budget tracking, configurable limits, read-only mode for demos

### Risk 2: Phaser Performance with Many Agents
**Mitigation:** Object pooling, sprite culling, canvas optimization, tested up to 10 agents

### Risk 3: WebSocket Scalability
**Mitigation:** Redis migration for state, horizontal scaling plan, message rate limiting

### Risk 4: Agent Hallucinations (Wrong Actions)
**Mitigation:** Action validation layer, permission system, supervised mode with human approval

### Risk 5: Complex Onboarding
**Mitigation:** One-click start-all script, Docker compose option, comprehensive docs

---

## Governance

**Project Lead:** Behrang Garakani (@bgarakani)
**License:** MIT
**Repository:** https://github.com/bgarakani/ha-agent-rpg
**Issue Tracker:** GitHub Issues
**Discussions:** GitHub Discussions
**CI/CD:** GitHub Actions + Codecov

**Contributor Recognition:** All contributors listed in release notes. Co-Authored-By tags in commits.

**Decision Making:** Benevolent dictator model. Project lead has final say on design decisions. Community input via GitHub Discussions.

---

## References

- **Inspiration:** Classic JRPGs (Final Fantasy, Dragon Quest), Dwarf Fortress, AI safety research
- **Related Projects:** LangChain, AutoGPT, OpenDevin, SWE-Agent
- **Research:** Multi-agent systems, emergent collaboration, spatial reasoning in LLMs

---

*This brief is a living document. Updated as the project evolves.*

*Last updated: 2026-02-21 by Doc Scribe*
