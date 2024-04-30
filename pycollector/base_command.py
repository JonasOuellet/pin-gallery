import argparse

from pathlib import Path


REGISTERED_COMMANDS: dict[str, "BaseCommand"] = {}


class BaseCommand:

    def __init__(self, name: str | None = None) -> None:
        if name is None:
            name = self.__class__.__name__
        self.name = name

    def get_parser(self) -> argparse.ArgumentParser:
        return argparse.ArgumentParser(f"pycollector {self.name}")

    def run(self, namespace: argparse.Namespace):
        raise NotADirectoryError("run must be implemented")


def register(command: BaseCommand):
    if command.name in REGISTERED_COMMANDS:
        raise Exception(f"A command with the name {command.name} already exists.")

    REGISTERED_COMMANDS[command.name] = command


def list_commands() -> list[str]:
    return list(REGISTERED_COMMANDS.keys())


def _init_commands():
    import importlib
    for f in Path(__file__).parent.joinpath("commands").glob("*.py"):
        importlib.import_module(f"{__package__}.commands.{f.stem}")


def get_command_by_name(name: str) -> BaseCommand | None:
    if cmd := REGISTERED_COMMANDS.get(name, None):
        return cmd
    return None
