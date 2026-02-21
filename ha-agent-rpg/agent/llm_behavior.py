"""
LLM-powered autonomous agent behavior using Claude API.

This module demonstrates how to integrate Claude (or any LLM) to make
autonomous decisions based on the current world state.

Prerequisites:
    pip install anthropic

Environment:
    export ANTHROPIC_API_KEY="your-api-key"
"""

import os
import json
from typing import Any, Dict, List
from anthropic import Anthropic


class LLMBehavior:
    """
    Uses Claude API to make autonomous decisions about what action to take.

    The agent observes the world state, forms a plan, and executes actions
    to accomplish its mission (e.g., explore the codebase, document APIs,
    write tests, etc.)
    """

    def __init__(self, agent_id: str, mission: str, role: str = "Explorer"):
        self.agent_id = agent_id
        self.mission = mission
        self.role = role
        self.client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
        self.conversation_history: List[Dict[str, str]] = []
        self.action_count = 0

        # Initialize with mission
        self.system_prompt = self._build_system_prompt()

    def _build_system_prompt(self) -> str:
        return f"""You are an autonomous AI agent in a JRPG-style interface exploring a codebase.

YOUR IDENTITY:
- Agent ID: {self.agent_id}
- Role: {self.role}
- Mission: {self.mission}

YOUR CAPABILITIES:
You can perform these actions each turn:

1. **move** - Move to an adjacent tile
   Params: {{ "x": <number>, "y": <number> }}
   Use this to navigate the map and reach files/objects

2. **speak** - Display dialogue in a text box
   Params: {{ "text": "<string>", "emote": "exclamation|question|heart|sweat|music" }}
   Use this to communicate findings, thoughts, or questions

3. **interact** - Interact with a map object (file, sign, etc.)
   Params: {{ "object_id": "<string>" }}
   Use this to examine files or read signs

4. **emote** - Show an emote bubble
   Params: {{ "type": "exclamation|question|heart|sweat|music" }}
   Use this for quick reactions

5. **wait** - Idle for a duration
   Params: {{ "duration_ms": <number> }}
   Use this when you need time to think or wait for others

6. **think** - Show a thought bubble (internal monologue)
   Params: {{ "text": "<string>" }}
   Use this to reflect on observations or plan next steps

YOUR GOAL:
Accomplish your mission by exploring the world, interacting with objects,
and communicating your findings. Be autonomous - don't wait for instructions.

IMPORTANT GUIDELINES:
- Focus on your mission
- Explore methodically (don't wander randomly)
- Use 'speak' to share important discoveries
- Use 'think' for internal reasoning
- Use 'interact' to examine files/objects you encounter
- Be collaborative - other agents may be present

RESPONSE FORMAT:
You must respond with a JSON object containing your chosen action:

{{
  "action": "move|speak|interact|emote|wait|think",
  "params": {{ /* action-specific params */ }},
  "reasoning": "Brief explanation of why you chose this action"
}}

Example:
{{
  "action": "speak",
  "params": {{ "text": "I found the main configuration file!", "emote": "exclamation" }},
  "reasoning": "Discovered important file that others should know about"
}}
"""

    def next_action(self, world_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Given the current world state, decide what action to take.

        Args:
            world_state: Current state including agents, map, objects, etc.

        Returns:
            Action dict with 'action' and 'params' keys
        """
        # Build observation from world state
        observation = self._observe_world(world_state)

        # Add observation to conversation history
        self.conversation_history.append({
            "role": "user",
            "content": f"Turn {self.action_count + 1}\n\n{observation}\n\nWhat action do you take?"
        })

        # Keep conversation history reasonable length (last 10 turns)
        if len(self.conversation_history) > 20:  # 10 user + 10 assistant
            self.conversation_history = self.conversation_history[-20:]

        # Call Claude API
        try:
            response = self.client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=500,
                temperature=0.7,
                system=self.system_prompt,
                messages=self.conversation_history
            )

            # Extract action from response
            action_response = response.content[0].text
            self.conversation_history.append({
                "role": "assistant",
                "content": action_response
            })

            # Parse JSON response
            action_data = self._parse_action(action_response)
            self.action_count += 1

            return action_data

        except Exception as e:
            print(f"[LLM] Error calling Claude API: {e}")
            # Fallback to wait action on error
            return {
                "action": "wait",
                "params": {"duration_ms": 1000}
            }

    def _observe_world(self, world_state: Dict[str, Any]) -> str:
        """Convert world state to natural language observation."""

        # Find self
        me = None
        for agent in world_state.get("agents", []):
            if agent["agent_id"] == self.agent_id:
                me = agent
                break

        if not me:
            return "You are not yet in the world."

        # Build observation
        obs_parts = []

        # Current position
        obs_parts.append(f"POSITION: You are at tile ({me['x']}, {me['y']})")

        # Current activity/status
        if me.get("current_activity"):
            obs_parts.append(f"STATUS: {me['current_activity']}")

        # Nearby objects (within 3 tiles)
        nearby_objects = []
        for obj in world_state.get("objects", []):
            dist = abs(obj["x"] - me["x"]) + abs(obj["y"] - me["y"])
            if dist <= 3:
                nearby_objects.append(obj)

        if nearby_objects:
            obs_parts.append("\nNEARBY OBJECTS:")
            for obj in nearby_objects:
                obj_type = obj.get("type", "unknown")
                label = obj.get("label", "unlabeled")
                distance = abs(obj["x"] - me["x"]) + abs(obj["y"] - me["y"])
                obs_parts.append(f"  - {obj_type} '{label}' at ({obj['x']}, {obj['y']}) - {distance} tiles away - ID: {obj['id']}")
        else:
            obs_parts.append("\nNEARBY OBJECTS: None within 3 tiles")

        # Other agents
        other_agents = [a for a in world_state.get("agents", []) if a["agent_id"] != self.agent_id]
        if other_agents:
            obs_parts.append("\nOTHER AGENTS:")
            for agent in other_agents:
                obs_parts.append(f"  - {agent['name']} ({agent['role']}) at ({agent['x']}, {agent['y']})")

        # Map info
        map_data = world_state.get("map", {})
        width = map_data.get("width", 20)
        height = map_data.get("height", 15)
        obs_parts.append(f"\nMAP: {width}x{height} tiles")

        # Current realm
        realm = me.get("realm", "/")
        obs_parts.append(f"REALM: {realm}")

        # Mission reminder
        obs_parts.append(f"\nYOUR MISSION: {self.mission}")
        obs_parts.append(f"ACTIONS TAKEN: {self.action_count}")

        return "\n".join(obs_parts)

    def _parse_action(self, response_text: str) -> Dict[str, Any]:
        """
        Parse Claude's response to extract the action.

        Handles both pure JSON and markdown-wrapped JSON.
        """
        try:
            # Try to find JSON in the response
            # Claude might wrap it in ```json blocks
            if "```json" in response_text:
                start = response_text.find("```json") + 7
                end = response_text.find("```", start)
                json_str = response_text[start:end].strip()
            elif "```" in response_text:
                start = response_text.find("```") + 3
                end = response_text.find("```", start)
                json_str = response_text[start:end].strip()
            else:
                # Try to find JSON object directly
                start = response_text.find("{")
                end = response_text.rfind("}") + 1
                if start != -1 and end > start:
                    json_str = response_text[start:end]
                else:
                    json_str = response_text

            data = json.loads(json_str)

            # Validate required fields
            if "action" not in data:
                raise ValueError("Missing 'action' field")
            if "params" not in data:
                raise ValueError("Missing 'params' field")

            # Log reasoning if present
            if "reasoning" in data:
                print(f"[LLM] Reasoning: {data['reasoning']}")

            return {
                "action": data["action"],
                "params": data["params"]
            }

        except Exception as e:
            print(f"[LLM] Failed to parse action: {e}")
            print(f"[LLM] Response was: {response_text}")
            # Fallback to wait
            return {
                "action": "wait",
                "params": {"duration_ms": 2000}
            }


class SimpleReflexBehavior:
    """
    Simplified LLM behavior using single-shot prompts (no conversation history).

    Cheaper and faster than LLMBehavior, but less coherent over time.
    Good for simple exploration tasks.
    """

    def __init__(self, agent_id: str, mission: str):
        self.agent_id = agent_id
        self.mission = mission
        self.client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    def next_action(self, world_state: Dict[str, Any]) -> Dict[str, Any]:
        """Simple reflex: observe world, decide action, forget."""

        me = self._find_self(world_state)
        if not me:
            return {"action": "wait", "params": {"duration_ms": 1000}}

        # Build prompt
        prompt = f"""You are an AI agent with mission: {self.mission}

Current situation:
- Position: ({me['x']}, {me['y']})
- Nearby objects: {self._list_nearby_objects(world_state, me)}
- Other agents: {len([a for a in world_state.get('agents', []) if a['agent_id'] != self.agent_id])}

Choose ONE action to take right now:
- move to adjacent tile
- speak to communicate
- interact with nearby object
- think about your mission
- wait briefly

Respond with JSON:
{{
  "action": "move|speak|interact|think|wait",
  "params": {{ /* action params */ }}
}}
"""

        try:
            response = self.client.messages.create(
                model="claude-3-5-haiku-20241022",  # Faster, cheaper model
                max_tokens=200,
                temperature=0.7,
                messages=[{"role": "user", "content": prompt}]
            )

            response_text = response.content[0].text

            # Parse JSON from response
            start = response_text.find("{")
            end = response_text.rfind("}") + 1
            if start != -1 and end > start:
                json_str = response_text[start:end]
                data = json.loads(json_str)
                return {"action": data["action"], "params": data["params"]}

        except Exception as e:
            print(f"[SimpleReflex] Error: {e}")

        # Fallback
        return {"action": "wait", "params": {"duration_ms": 1000}}

    def _find_self(self, world_state: Dict[str, Any]) -> Dict[str, Any] | None:
        for agent in world_state.get("agents", []):
            if agent["agent_id"] == self.agent_id:
                return agent
        return None

    def _list_nearby_objects(self, world_state: Dict[str, Any], me: Dict[str, Any]) -> str:
        nearby = []
        for obj in world_state.get("objects", []):
            dist = abs(obj["x"] - me["x"]) + abs(obj["y"] - me["y"])
            if dist <= 2:
                nearby.append(f"{obj.get('type', 'object')} '{obj.get('label', 'unknown')}' ({obj['id']})")
        return ", ".join(nearby) if nearby else "none"
