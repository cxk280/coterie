"""Pluggable registries for adapters and modes.

Following the Open/Closed Principle from the SOLID Agent Swarms deck (slide 08):
adding a new adapter or mode is a decorator + a module — never an edit to the
registry itself.

    @register_adapter
    class MyAdapter(CLIAdapter):
        name = "my-cli"
        ...

    @register_mode("my-mode")
    def build(...): ...
"""

from collections.abc import Callable
from typing import Any, TypeVar


class AlreadyRegisteredError(KeyError):
    pass


class Registry:
    """Generic name -> object registry. Used for adapters and modes."""

    def __init__(self, kind: str) -> None:
        self._kind = kind
        self._items: dict[str, Any] = {}

    def register(self, name: str, item: Any) -> Any:
        if not name:
            raise ValueError(f"{self._kind} must have a non-empty name")
        if name in self._items:
            raise AlreadyRegisteredError(
                f"{self._kind} {name!r} is already registered as {self._items[name]!r}"
            )
        self._items[name] = item
        return item

    def get(self, name: str) -> Any | None:
        return self._items.get(name)

    def require(self, name: str) -> Any:
        item = self._items.get(name)
        if item is None:
            raise KeyError(f"{self._kind} {name!r} is not registered; known: {self.names()}")
        return item

    def names(self) -> list[str]:
        return list(self._items.keys())

    def __contains__(self, name: str) -> bool:
        return name in self._items

    def __iter__(self):
        return iter(self._items.items())

    def reset(self) -> None:
        """Test helper. Wipes the registry."""
        self._items.clear()


# Process-wide singletons. Adapters and modes register at import time.
ADAPTER_REGISTRY = Registry("adapter")
MODE_REGISTRY = Registry("mode")


T = TypeVar("T")


def register_adapter(cls: type[T]) -> type[T]:
    """Class decorator: registers `cls` in ADAPTER_REGISTRY under `cls.name`."""
    name = getattr(cls, "name", None)
    if not name:
        raise ValueError(
            f"{cls.__name__} must declare a class attribute `name: ClassVar[str]` "
            "to be registered as an adapter"
        )
    ADAPTER_REGISTRY.register(name, cls)
    return cls


def register_mode(name: str) -> Callable[[Callable], Callable]:
    """Function decorator: registers a mode builder under `name`.

    Mode builders have signature `(workdir, executor, config, **llm_clients) -> CompiledGraph`.
    """

    def decorator(fn: Callable) -> Callable:
        MODE_REGISTRY.register(name, fn)
        return fn

    return decorator
