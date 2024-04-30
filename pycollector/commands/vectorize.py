from argparse import ArgumentParser, Namespace
from ..base_command import BaseCommand, register


class Vectorize(BaseCommand):

    def __init__(self) -> None:
        super().__init__("vectorize")

    def get_parser(self) -> ArgumentParser:
        parser = super().get_parser()
        parser.description = "Vectorize specified file"
        parser.add_argument("file", nargs=1, type=str, help="the local or remote file")
        parser.add_argument("--no-text", action="store_true")

        return parser

    def run(self, namespace: Namespace):
        from .. import core, core_tf

        with core.DownloadOrLocalImage(namespace.file[0]) as file:
            if namespace.no_text:
                result = core_tf.vectorize_file(file)
            else:
                result, _ = core_tf.vectorize_with_text(file)

        print(result.tolist())


register(Vectorize())
