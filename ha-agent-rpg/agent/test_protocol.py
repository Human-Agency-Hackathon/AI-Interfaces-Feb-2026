"""Tests for the protocol message builders and parser."""
import json
import pytest
from protocol import RegisterMessage, ActionMessage, parse_message


class TestRegisterMessage:
    def test_creates_message_with_correct_fields(self):
        msg = RegisterMessage(agent_id="a1", name="Oracle", color=0xFF3300)
        assert msg.agent_id == "a1"
        assert msg.name == "Oracle"
        assert msg.color == 0xFF3300
        assert msg.type == "agent:register"

    def test_to_json_returns_valid_json(self):
        msg = RegisterMessage(agent_id="a1", name="Oracle", color=0xFF3300)
        raw = msg.to_json()
        data = json.loads(raw)
        assert data["agent_id"] == "a1"
        assert data["name"] == "Oracle"
        assert data["color"] == 0xFF3300
        assert data["type"] == "agent:register"

    def test_default_type_is_agent_register(self):
        msg = RegisterMessage(agent_id="a1", name="Test", color=0)
        assert msg.type == "agent:register"


class TestActionMessage:
    def test_creates_message_with_correct_fields(self):
        msg = ActionMessage(
            agent_id="a1",
            turn_id=1,
            action="move",
            params={"x": 5, "y": 3},
        )
        assert msg.agent_id == "a1"
        assert msg.turn_id == 1
        assert msg.action == "move"
        assert msg.params == {"x": 5, "y": 3}
        assert msg.type == "agent:action"

    def test_to_json_returns_valid_json(self):
        msg = ActionMessage(
            agent_id="a1",
            turn_id=1,
            action="speak",
            params={"text": "hello"},
        )
        raw = msg.to_json()
        data = json.loads(raw)
        assert data["agent_id"] == "a1"
        assert data["turn_id"] == 1
        assert data["action"] == "speak"
        assert data["params"] == {"text": "hello"}
        assert data["type"] == "agent:action"

    def test_default_params_is_empty_dict(self):
        msg = ActionMessage(agent_id="a1", turn_id=1, action="wait")
        assert msg.params == {}

    def test_default_type_is_agent_action(self):
        msg = ActionMessage(agent_id="a1", turn_id=1, action="wait")
        assert msg.type == "agent:action"

    def test_to_json_with_empty_params(self):
        msg = ActionMessage(agent_id="a1", turn_id=1, action="wait")
        data = json.loads(msg.to_json())
        assert data["params"] == {}


class TestParseMessage:
    def test_parses_valid_json(self):
        raw = '{"type": "world:state", "tick": 1}'
        result = parse_message(raw)
        assert result["type"] == "world:state"
        assert result["tick"] == 1

    def test_returns_dict(self):
        result = parse_message('{"key": "value"}')
        assert isinstance(result, dict)

    def test_raises_on_invalid_json(self):
        with pytest.raises(json.JSONDecodeError):
            parse_message("not valid json")

    def test_parses_nested_objects(self):
        raw = '{"type": "turn:start", "params": {"x": 1, "y": 2}}'
        result = parse_message(raw)
        assert result["params"]["x"] == 1
        assert result["params"]["y"] == 2

    def test_parses_arrays(self):
        raw = '{"agents": [{"id": "a1"}, {"id": "a2"}]}'
        result = parse_message(raw)
        assert len(result["agents"]) == 2
        assert result["agents"][0]["id"] == "a1"


class TestRoundTrip:
    """Test that messages can be serialized and parsed back."""

    def test_register_message_round_trip(self):
        msg = RegisterMessage(agent_id="a1", name="Oracle", color=255)
        raw = msg.to_json()
        parsed = parse_message(raw)
        assert parsed["agent_id"] == "a1"
        assert parsed["name"] == "Oracle"
        assert parsed["color"] == 255
        assert parsed["type"] == "agent:register"

    def test_action_message_round_trip(self):
        msg = ActionMessage(
            agent_id="a1", turn_id=42, action="move", params={"x": 5, "y": 3}
        )
        raw = msg.to_json()
        parsed = parse_message(raw)
        assert parsed["agent_id"] == "a1"
        assert parsed["turn_id"] == 42
        assert parsed["action"] == "move"
        assert parsed["params"] == {"x": 5, "y": 3}
