from argparse import ArgumentParser, Namespace
from ..base_command import BaseCommand, register


class ClusterCommand(BaseCommand):

    def __init__(self) -> None:
        super().__init__("cluster")

    def get_parser(self) -> ArgumentParser:
        parser = super().get_parser()
        parser.add_argument('-s', '--size', type=int, default=20)
        parser.add_argument('-n', '--no-reduction', action="store_true")
        return parser

    def run(self, namespace: Namespace):
        from ..clustering import cluster
        cluster(
            size=namespace.size,
            no_data_reduction=namespace.no_reduction
        )


class ClearClusterCommand(BaseCommand):

    def __init__(self) -> None:
        super().__init__("clear-cluster")

    def run(self, namespace: Namespace):
        from .. import core
        items = core.get_all_items()
        for x, index in enumerate(items):
            print(f"\r{x + 1}/{len(items)} - {index.id}", end='', flush=True)

            index.reference.update({
                "cluster": -1,
                "distance": 0 
            })

        print("\nDone!", flush=True)


register(ClusterCommand())
register(ClearClusterCommand())
