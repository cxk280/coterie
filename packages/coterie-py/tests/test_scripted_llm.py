import json
from pathlib import Path

import pytest
from coterie.core.llm.scripted import ScriptedLLMClient, ScriptedLLMError


def test_replays_in_order():
    client = ScriptedLLMClient(["one", "two", "three"])
    assert client.chat("sys", [{"role": "user", "content": "a"}]) == "one"
    assert client.chat("sys", []) == "two"
    assert client.chat("sys", []) == "three"


def test_exhaustion_raises():
    client = ScriptedLLMClient(["only"])
    client.chat("sys", [])
    with pytest.raises(ScriptedLLMError):
        client.chat("sys", [])


def test_records_calls():
    client = ScriptedLLMClient(["a"])
    client.chat("sys-prompt", [{"role": "user", "content": "msg"}])
    assert client.calls == [{"system": "sys-prompt", "messages": [{"role": "user", "content": "msg"}]}]


def test_queue_appends():
    client = ScriptedLLMClient([])
    client.queue("late-added")
    assert client.chat("sys", []) == "late-added"


def test_from_fixture(tmp_path: Path):
    fixture = tmp_path / "fixture.json"
    fixture.write_text(json.dumps(["one", "two"]))
    client = ScriptedLLMClient.from_fixture(fixture)
    assert client.chat("sys", []) == "one"
    assert client.chat("sys", []) == "two"


def test_from_fixture_validates_shape(tmp_path: Path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"not": "an-array"}))
    with pytest.raises(ValueError):
        ScriptedLLMClient.from_fixture(bad)
