from argparse import ArgumentParser, Namespace
from ..base_command import BaseCommand, register


class RebuildIndexes(BaseCommand):

    def __init__(self) -> None:
        super().__init__("rebuild-with-text")

    def get_parser(self) -> ArgumentParser:
        parser = super().get_parser()
        return parser

    def run(self, namespace: Namespace):
        from .. import core
        import numpy as np

        ids = core.load_ids()
        b0datas = core.load_datapoints()

        total = b0datas.shape[0]

        to_remove = []

        for x, (_id, data) in enumerate(zip(ids, b0datas), 1):
            print(f"{round((x/total) * 100)}% ({x} / {total}) {_id}")
            doc = core.item_collection.document(_id)
            texts = doc.get(["text"]).get("text")
            if texts is None:
                to_remove.append((x - 1, _id))
                continue

            result = core.encode_text(texts)
            if result is not None:
                print("Updated index with text: ", texts)
                data[:] = result
            else:
                print("Text is invalid", texts)

        for idx, rem in reversed(to_remove):
            print(f"Removing {rem} at {idx}. It doesn't exist anymore.")
            ids.pop(idx)
            b0datas = np.delete(b0datas, idx, 0)

        core.write_datapoints(b0datas)
        core.write_ids(ids)


register(RebuildIndexes())
