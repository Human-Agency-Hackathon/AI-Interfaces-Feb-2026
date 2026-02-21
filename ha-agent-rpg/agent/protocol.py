import json
from dataclasses import dataclass, field, asdict


@dataclass
class RegisterMessage:
    agent_id: str
    name: str
    color: int
    type: str = "agent:register"

    def to_json(self) -> str:
        return json.dumps(asdict(self))


@dataclass
class ActionMessage:
    agent_id: str
    turn_id: int
    action: str
    params: dict = field(default_factory=dict)
    type: str = "agent:action"

    def to_json(self) -> str:
        return json.dumps(asdict(self))


def parse_message(raw: str) -> dict:
    return json.loads(raw)
