from argparse import ArgumentParser, Namespace
from ..base_command import BaseCommand, register


class NeirestNeighbors(BaseCommand):

    def __init__(self) -> None:
        super().__init__("nearest-neighbors")

    def get_parser(self) -> ArgumentParser:
        parser = super().get_parser()
        parser.description = "Find the closest neighbors of the specified file"
        parser.add_argument("file", nargs=1, type=str, help="the local or remote file")
        parser.add_argument("-n", "--number", type=int, default=5)
        parser.add_argument("--to-file", type=str, default="")

        return parser

    def run(self, namespace: Namespace):
        from .. import nearest_neighbors as nn

        result = nn.find(namespace.file[0], namespace.number)

        if namespace.to_file:
            import json
            with open(namespace.to_file, mode='w') as f:
                json.dump(result, f, indent=4)
                print(f'result written to "{namespace.to_file}"')
        else:
            for _id, dist in result:
                print(_id, dist)


register(NeirestNeighbors())
