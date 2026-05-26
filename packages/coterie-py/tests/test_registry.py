import pytest
from coterie.core.registry import (
    ADAPTER_REGISTRY,
    MODE_REGISTRY,
    AlreadyRegisteredError,
    Registry,
    register_adapter,
    register_mode,
)


def test_builtin_adapters_registered():
    assert {"claude-code", "codex", "fake"}.issubset(set(ADAPTER_REGISTRY.names()))


def test_builtin_modes_registered():
    assert set(MODE_REGISTRY.names()) == {"single", "consensus", "adversarial", "debate", "tournament"}


def test_register_duplicate_raises():
    r = Registry("adapter")
    r.register("x", object())
    with pytest.raises(AlreadyRegisteredError):
        r.register("x", object())


def test_register_missing_name_raises():
    r = Registry("adapter")
    with pytest.raises(ValueError):
        r.register("", object())


def test_require_unknown_raises():
    r = Registry("mode")
    with pytest.raises(KeyError):
        r.require("nope")


def test_adapter_decorator_requires_name_attribute():
    with pytest.raises(ValueError, match="name"):

        @register_adapter
        class _NoName:
            pass


def test_mode_decorator():
    """Mode decorators take name as arg, return original function."""

    @register_mode("__test_mode_xyz__")
    def builder():
        return "hi"

    assert MODE_REGISTRY.get("__test_mode_xyz__") is builder
    # Cleanup so we don't leak into other tests.
    MODE_REGISTRY._items.pop("__test_mode_xyz__", None)
