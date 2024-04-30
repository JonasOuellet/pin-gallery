from argparse import ArgumentParser, Namespace
from ..base_command import BaseCommand, register


class ClusterCommand(BaseCommand):

    def __init__(self) -> None:
        super().__init__("cluster")

    def get_parser(self) -> ArgumentParser:
        parser = super().get_parser()
        parser.add_argument('-s', '--size', type=int, default=20)
        return parser

    def run(self, namespace: Namespace):
        from ..clustering import cluster
        cluster(
            size=namespace.size
        )


register(ClusterCommand())
