"""Sample AI Agent — connects to the bridge server and takes scripted actions."""

import asyncio
import sys

import websockets

from protocol import RegisterMessage, ActionMessage, parse_message
from behaviors import ScriptedBehavior

BRIDGE_URL = "ws://localhost:3001"


async def main():
    agent_id = sys.argv[1] if len(sys.argv) > 1 else "agent_1"
    agent_name = sys.argv[2] if len(sys.argv) > 2 else "Hero"
    agent_color = int(sys.argv[3], 16) if len(sys.argv) > 3 else 0xFF3300

    behavior = ScriptedBehavior(agent_id)
    world_state: dict = {}

    async with websockets.connect(BRIDGE_URL) as ws:
        # Register with the bridge
        reg = RegisterMessage(agent_id=agent_id, name=agent_name, color=agent_color)
        await ws.send(reg.to_json())
        print(f"[{agent_id}] Registered as {agent_name}")

        async for raw in ws:
            msg = parse_message(raw)
            msg_type = msg.get("type")

            if msg_type == "world:state":
                world_state = msg

            elif msg_type == "turn:start":
                if msg["agent_id"] == agent_id:
                    turn_id = msg["turn_id"]
                    chosen = behavior.next_action(world_state)
                    action_msg = ActionMessage(
                        agent_id=agent_id,
                        turn_id=turn_id,
                        action=chosen["action"],
                        params=chosen["params"],
                    )
                    await ws.send(action_msg.to_json())
                    print(f"[{agent_id}] Turn {turn_id}: {chosen['action']} {chosen['params']}")

            elif msg_type == "action:result":
                # Update local position tracking from successful moves
                if msg.get("success") and msg.get("action") == "move":
                    for agent in world_state.get("agents", []):
                        if agent["agent_id"] == msg["agent_id"]:
                            agent["x"] = msg["params"]["x"]
                            agent["y"] = msg["params"]["y"]

                # Only log own failures
                if msg["agent_id"] == agent_id and not msg["success"]:
                    print(f"[{agent_id}] FAIL: {msg.get('error')}")

            elif msg_type == "agent:joined":
                print(f"[{agent_id}] Agent joined: {msg['agent']['name']}")

            elif msg_type == "agent:left":
                print(f"[{agent_id}] Agent left: {msg['agent_id']}")

            elif msg_type == "error":
                print(f"[{agent_id}] Error: {msg['message']}")


if __name__ == "__main__":
    asyncio.run(main())
