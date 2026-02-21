# Agent Dungeon: User Workflow

## Entry Flow

```mermaid
graph TD
    Splash["**Splash Page**<br/>Marketing copy, project tagline,<br/>what Agent Dungeon is"]
    Splash -->|Get Started| Entry

    Entry["**Problem Entry**<br/>User describes a problem<br/>or topic to brainstorm"]
    Entry --> Context

    Context["**Optional Context**<br/>Link a repo, folder, or files<br/>as reference material"]
    Context -->|Scan & Generate| Loading

    Loading["**Processing**<br/>Analyze inputs, build dungeon map,<br/>assemble agent party"]
    Loading -->|repo:ready| Map

    Map["**RPG Map**<br/>Tile-based dungeon view<br/>Agents spawn and begin work"]

    Map --- Actions

    subgraph Actions["**In-Map Actions**"]
        direction TB
        Watch["**Observe**<br/>Watch agents move, talk,<br/>examine files, post findings"]
        Command["**Command**<br/>Direct agents via prompt bar<br/>slash commands"]
        Mode["**Switch Mode**<br/>Manual / Supervised / Autonomous"]
        Navigate["**Navigate**<br/>Enter rooms through doors<br/>explore folder hierarchy"]
        Quest["**Quests**<br/>View quest log, track progress<br/>from GitHub issues or brainstorm goals"]
        Findings["**Findings Board**<br/>Shared discoveries posted<br/>by agents in real time"]
        Summon["**Summon Agents**<br/>Call in specialists:<br/>Divergent, Convergent, Researcher,<br/>Prioritizer, Presenter"]
        Output["**Deliverable**<br/>Presenter assembles final<br/>structured output"]
    end
```

## What Changes from Today's Flow

| Current | Proposed |
|---------|----------|
| TitleScreen: "Agent RPG / Begin Quest" | Splash page with marketing copy explaining the product |
| RepoScreen: repo URL or path required | Problem entry first, repo/files optional as context |
| Agents are generic (Oracle spawns first) | Agents are brainstorm specialists with defined roles |
| No final output step | Presenter agent assembles a deliverable |

The big conceptual shift is that the **problem drives the session**, not the repo. The repo is supporting material, not the entry point.
