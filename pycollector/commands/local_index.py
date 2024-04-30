from argparse import ArgumentParser, Namespace
from ..base_command import BaseCommand, register


class LocalIndex(BaseCommand):

    def __init__(self) -> None:
        super().__init__("local-index")

        self.actions = {
            "upload": self.upload,
            "update": self.update,
            "download": self.download,
            "remove": self.remove
        }

    def download(self, namespace: Namespace):
        from .. import core
        core.download_local_index()

    def upload(self, namespace: Namespace):
        from .. import core
        core.upload_local_index()

    def remove(self, namespace: Namespace):
        import numpy as np
        from .. import core

        ids = core.load_ids()
        datapoints = core.load_datapoints()
        any_removed = False
        for to_remove in namespace.datapoints:
            try:
                index = ids.index(to_remove)
                print(f"Removing {to_remove}")
                ids.pop(index)
                datapoints = np.delete(datapoints, index, 0)
                any_removed = True
            except ValueError:
                print(f"couldn't find index: {to_remove}")
        
        if any_removed:
            core.write_datapoints(datapoints)
            core.write_ids(ids)
            core.upload_local_index()

    def get_parser(self) -> ArgumentParser:
        parser = super().get_parser()
        subparser = parser.add_subparsers(dest="subcommand")
        parser_upload = subparser.add_parser("upload", description="upload the local index to bucket")
        parser_update = subparser.add_parser("update", description="update local index to match remote")
        parser_update.add_argument("-o", "--override", action="store_true")
        parser_update.add_argument("--update-text", action="store_true")
        parser_download = subparser.add_parser("download", description="update local index to match remote")
        parser_remove = subparser.add_parser("remove", description="update local index to match remote")
        parser_remove.add_argument('datapoints', nargs='+', type=str)

        return parser

    def run(self, namespace: Namespace):
        return self.actions[namespace.subcommand](namespace)

    def update(self, namespace: Namespace):
        import numpy as np
        from .. import core

        if namespace.override:
            print('Overriding existing files with the one in the bucket.')
            core.download_local_index()

        try:
            ids = core.load_ids()
            datapoints = core.load_datapoints()
        except:
            ids = []
            datapoints = None

        removed = False
        if ids and datapoints is not None:
            # verify the existance of all the ids
            print("Verifying existance of ids...")
            to_remove: list[tuple[int, str]] = []
            for x, _id in enumerate(ids):
                if not core.item_collection.document(_id).get().exists:
                    to_remove.append((x, _id))

                if x == 0:
                    print(f"{x + 1}/{len(ids)} - {_id}", end='', flush=True)
                else:
                    print(f"\r{x + 1}/{len(ids)} - {_id}", end='', flush=True)
            
            for idx, _id in reversed(to_remove):
                print(f'Id "{_id}" doesn\'t exist anymore')
                ids.pop(idx)
                datapoints = np.delete(datapoints, idx, 0)
                removed = True

            if removed:
                core.write_ids(ids)
                core.write_datapoints(datapoints)

            print(f"Starting update after item: {ids[-1]}")
            items = core.get_all_items(start_after_id=ids[-1])
        else:
            print("No local index found starting the generation from the begining..")
            items = core.get_all_items()

        if not len(items):
            print("No item found to update.")
            if removed:
                core.upload_local_index()
            return
        
        from .. import core_tf

        print(f"Found {len(items)} items to update")

        with (
            open("./ids.txt", mode='a') as ids_file,
            open("./datapoints.bin", mode="ab") as datapoints_file
        ):
            for x, item in enumerate(items):
                _id = item.id
                print(f'{x + 1}/{len(items)} {_id}')
                with core.DownloadOrLocalImage(_id) as filename:
                    texts = core.detect_text(filename)
                    if namespace.update_text:
                        item.reference.update({"text": texts})
                        print(f'Text updated with {texts}')
                    result, _ = core_tf.vectorize_with_text(filename, texts=texts)
                    result.tofile(datapoints_file)
                ids_file.write(f"{_id}\n")

            core.upload_local_index()


register(LocalIndex())
