#!/usr/bin/env python3
"""
LLM-powered autonomous agent example.

This agent uses Claude API to make intelligent decisions about actions.

Usage:
    export ANTHROPIC_API_KEY="your-api-key"
    python3 llm_agent.py <agent_id> <name> <color_hex> [--mission "your mission"]

Examples:
    python3 llm_agent.py explorer_1 "Code Explorer" ff6b35 --mission "Find and document all API endpoints"
    python3 llm_agent.py tester_1 "Test Guardian" 3b82f6 --mission "Identify files that need test coverage"
    python3 llm_agent.py doc_writer "Doc Scribe" 10b981 --mission "Create documentation for undocumented modules"

Requirements:
    pip install anthropic websockets
"""

import asyncio
import argparse
import json
import sys
import os
from typing import Dict, Any

try:
    import websockets
    from llm_behavior import LLMBehavior, SimpleReflexBehavior
except ImportError as e:
    print(f"Error: Missing dependency: {e}")
    print("Install with: pip install anthropic websockets")
    sys.exit(1)


class LLMAgent:
    """Autonomous agent powered by Claude API."""

    def __init__(
        self,
        agent_id: str,
        name: str,
        color: int,
        mission: str,
        server_url: str = "ws://localhost:3001",
        behavior_type: str = "full"
    ):
        self.agent_id = agent_id
        self.name = name
        self.color = color
        self.mission = mission
        self.server_url = server_url

        # Choose behavior type
        if behavior_type == "simple":
            self.behavior = SimpleReflexBehavior(agent_id, mission)
            print(f"[Agent] Using SimpleReflexBehavior (faster, cheaper)")
        else:
            self.behavior = LLMBehavior(agent_id, mission, role=name)
            print(f"[Agent] Using LLMBehavior (full conversation history)")

        self.world_state: Dict[str, Any] = {}
        self.current_turn_id: int | None = None

    async def run(self):
        """Main agent loop: connect, register, respond to turns."""

        print(f"\n🤖 Starting LLM Agent: {self.name}")
        print(f"   Agent ID: {self.agent_id}")
        print(f"   Color: #{self.color:06x}")
        print(f"   Mission: {self.mission}")
        print(f"   Server: {self.server_url}\n")

        try:
            async with websockets.connect(self.server_url) as ws:
                print(f"✅ Connected to server")

                # Register with server
                await self._register(ws)

                # Main message loop
                async for raw_message in ws:
                    try:
                        msg = json.loads(raw_message)
                        await self._handle_message(ws, msg)
                    except json.JSONDecodeError as e:
                        print(f"[Agent] Failed to parse message: {e}")
                    except Exception as e:
                        print(f"[Agent] Error handling message: {e}")

        except websockets.exceptions.ConnectionClosed:
            print(f"❌ Connection closed")
        except Exception as e:
            print(f"❌ Error: {e}")

    async def _register(self, ws):
        """Register agent with the server."""
        register_msg = {
            "type": "agent:register",
            "agent_id": self.agent_id,
            "name": self.name,
            "color": self.color
        }
        await ws.send(json.dumps(register_msg))
        print(f"📤 Sent registration")

    async def _handle_message(self, ws, msg: Dict[str, Any]):
        """Handle incoming messages from server."""

        msg_type = msg.get("type")

        if msg_type == "world:state":
            # Store world state for decision making
            self.world_state = msg
            print(f"🌍 Received world state ({len(msg.get('agents', []))} agents, {len(msg.get('objects', []))} objects)")

        elif msg_type == "turn:start":
            # NOTE: The server does not currently send turn:start messages.
            # Server-managed agents use Claude Agent SDK follow-up prompts instead.
            # This handler is kept for forward-compatibility if the turn protocol
            # is implemented for external (non-SDK) agents in the future.
            if msg.get("agent_id") == self.agent_id:
                turn_id = msg.get("turn_id")
                timeout_ms = msg.get("timeout_ms", 5000)
                print(f"\n⏰ Turn {turn_id} started (timeout: {timeout_ms}ms)")

                # Decide action using LLM
                action_data = self.behavior.next_action(self.world_state)

                # Send action to server
                action_msg = {
                    "type": "agent:action",
                    "agent_id": self.agent_id,
                    "turn_id": turn_id,
                    "action": action_data["action"],
                    "params": action_data["params"]
                }

                await ws.send(json.dumps(action_msg))
                print(f"📤 Sent action: {action_data['action']} with params {action_data['params']}")

        elif msg_type == "action:result":
            # Result of our action
            if msg.get("agent_id") == self.agent_id:
                success = msg.get("success")
                error = msg.get("error")
                if success:
                    print(f"✅ Action succeeded")
                else:
                    print(f"❌ Action failed: {error}")

        elif msg_type == "agent:joined":
            # Another agent joined
            agent = msg.get("agent")
            if agent and agent["agent_id"] != self.agent_id:
                print(f"👋 Agent joined: {agent['name']} ({agent['role']})")

        elif msg_type == "agent:left":
            # Another agent left
            agent_id = msg.get("agent_id")
            if agent_id != self.agent_id:
                print(f"👋 Agent left: {agent_id}")

        elif msg_type == "findings:posted":
            # Team finding posted — server sends flat structure:
            # { type, agent_id, agent_name, realm, finding: string, severity: string }
            severity = msg.get("severity", "low")
            finding_text = msg.get("finding", "")
            agent_name = msg.get("agent_name", "unknown")
            print(f"📢 Finding [{severity.upper()}] by {agent_name}: {finding_text[:100]}...")

        elif msg_type == "agent:level-up":
            # Agent gained expertise
            if msg.get("agent_id") == self.agent_id:
                area = msg.get("area")
                level = msg.get("level")
                print(f"📈 Level up! {area}: {level}")

        elif msg_type == "agent:spawn-request":
            # Agent summoned — protocol fields: requested_name, requested_role, requested_mission
            print(f"🔮 Agent summoned: {msg.get('requested_name')} for {msg.get('requested_mission')}")

        # Ignore other message types silently


def parse_color(color_str: str) -> int:
    """Parse hex color string to integer."""
    color_str = color_str.lstrip("#")
    return int(color_str, 16)


def main():
    parser = argparse.ArgumentParser(
        description="LLM-powered autonomous AI agent for codebase exploration",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 llm_agent.py explorer "Code Explorer" ff6b35 --mission "Find all API endpoints"
  python3 llm_agent.py tester "Test Writer" 3b82f6 --mission "Identify untested code" --simple
  python3 llm_agent.py docs "Doc Scribe" 10b981 --mission "Document public APIs"
        """
    )

    parser.add_argument("agent_id", help="Unique agent identifier (e.g., explorer_1)")
    parser.add_argument("name", help="Display name (e.g., 'Code Explorer')")
    parser.add_argument("color", help="Hex color (e.g., ff6b35)")
    parser.add_argument("--mission", "-m", default="Explore the codebase and report findings",
                        help="Agent's mission/goal")
    parser.add_argument("--server", "-s", default="ws://localhost:3001",
                        help="Bridge server WebSocket URL")
    parser.add_argument("--simple", action="store_true",
                        help="Use SimpleReflexBehavior (faster, cheaper, no memory)")

    args = parser.parse_args()

    # Check for API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("❌ Error: ANTHROPIC_API_KEY environment variable not set")
        print("\nSet it with:")
        print("  export ANTHROPIC_API_KEY='your-api-key'")
        print("\nGet an API key at: https://console.anthropic.com/")
        sys.exit(1)

    # Parse color
    try:
        color = parse_color(args.color)
    except ValueError:
        print(f"❌ Error: Invalid color hex: {args.color}")
        sys.exit(1)

    # Create and run agent
    agent = LLMAgent(
        agent_id=args.agent_id,
        name=args.name,
        color=color,
        mission=args.mission,
        server_url=args.server,
        behavior_type="simple" if args.simple else "full"
    )

    # Run async event loop
    asyncio.run(agent.run())


if __name__ == "__main__":
    main()
