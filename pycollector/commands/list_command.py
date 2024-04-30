from argparse import Namespace
from ..base_command import BaseCommand, register, list_commands


class ListCommand(BaseCommand):

    def __init__(self) -> None:
        super().__init__("list")

    def run(self, namespace: Namespace):
        print("List of available command: ")
        for command in list_commands():
            print(f"    {command}")


register(ListCommand())
