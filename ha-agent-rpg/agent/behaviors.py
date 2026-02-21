class ScriptedBehavior:
    """Cycles through a scripted sequence demonstrating all 6 action types."""

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.step = 0
        self.sequence = [
            {"action": "speak", "params": {"text": "Hello! I have entered the world."}},
            {"action": "emote", "params": {"type": "exclamation"}},
            {"action": "move", "params": {}},
            {"action": "move", "params": {}},
            {"action": "speak", "params": {"text": "Exploring this area..."}},
            {"action": "emote", "params": {"type": "question"}},
            {"action": "move", "params": {}},
            {"action": "skill", "params": {"skill_id": "attack", "target_id": ""}},
            {"action": "wait", "params": {"duration_ms": 1000}},
            {"action": "speak", "params": {"text": "That was interesting!"}},
            {"action": "interact", "params": {"object_id": "sign_1"}},
            {"action": "emote", "params": {"type": "heart"}},
        ]

    def next_action(self, world_state: dict) -> dict:
        template = self.sequence[self.step % len(self.sequence)]
        self.step += 1

        action = template["action"]
        params = dict(template["params"])

        if action == "move":
            params = self._compute_move(world_state)
        elif action == "skill":
            target = self._find_target(world_state)
            if target:
                params["target_id"] = target
            else:
                # No target available, fall back to wait
                return {"action": "wait", "params": {"duration_ms": 500}}

        return {"action": action, "params": params}

    def _compute_move(self, world_state: dict) -> dict:
        me = self._find_self(world_state)
        if not me:
            return {"x": 2, "y": 2}

        directions = [(1, 0), (0, 1), (-1, 0), (0, -1)]
        dx, dy = directions[self.step % len(directions)]
        new_x = me["x"] + dx
        new_y = me["y"] + dy

        # Basic bounds check (server will validate fully)
        tiles = world_state.get("map", {}).get("tiles", [])
        w = world_state.get("map", {}).get("width", 20)
        h = world_state.get("map", {}).get("height", 15)

        if 0 <= new_x < w and 0 <= new_y < h:
            tile = tiles[new_y][new_x] if new_y < len(tiles) and new_x < len(tiles[0]) else 1
            if tile == 0:
                return {"x": new_x, "y": new_y}

        # If not walkable, try other directions
        for ddx, ddy in directions:
            nx, ny = me["x"] + ddx, me["y"] + ddy
            if 0 <= nx < w and 0 <= ny < h:
                tile = tiles[ny][nx] if ny < len(tiles) and nx < len(tiles[0]) else 1
                if tile == 0:
                    # Check not occupied by another agent
                    occupied = any(
                        a["x"] == nx and a["y"] == ny
                        for a in world_state.get("agents", [])
                        if a["agent_id"] != self.agent_id
                    )
                    if not occupied:
                        return {"x": nx, "y": ny}

        # Stuck — just stay (will be rejected, that's OK)
        return {"x": me["x"] + 1, "y": me["y"]}

    def _find_self(self, world_state: dict) -> dict | None:
        for agent in world_state.get("agents", []):
            if agent["agent_id"] == self.agent_id:
                return agent
        return None

    def _find_target(self, world_state: dict) -> str | None:
        for agent in world_state.get("agents", []):
            if agent["agent_id"] != self.agent_id:
                return agent["agent_id"]
        return None
