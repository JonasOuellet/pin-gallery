import os
import json
from itertools import chain
from pathlib import Path
from typing import TypedDict, TYPE_CHECKING
from tempfile import NamedTemporaryFile

import argparse

from google.cloud import storage

if TYPE_CHECKING:
    from google.cloud.storage.blob import Blob


class TEmbedding(TypedDict):
    id: str
    embedding: str


model = None


def vectorize_file(filename: str) -> list[float]:
    import tensorflow as tf
    raw = tf.io.read_file(filename)
    return vectorize(raw, Path(filename).suffix)


def vectorize(raw, ext) -> list[float]:
    global model
    import tensorflow as tf
    import numpy as np

    if model is None:
        model = tf.keras.applications.EfficientNetB0(include_top=False, pooling="avg")

    if ext.lower() == '.png':
        image = tf.image.decode_png(raw, channels=3)
    elif ext.lower() in ['.jpeg', '.jpg']:
        image = tf.image.decode_jpeg(raw, channels=3)
    else:
        raise Exception(f"Invalid extension: {ext}")
    
    # https://keras.io/examples/vision/image_classification_efficientnet_fine_tuning/
    # should I use pad here ?
    resized = tf.image.resize(image, [224, 224])

    return model.predict(np.array([resized.numpy()]))[0].tolist()



def vectorize_blob(blob: "Blob") -> list[float]:
    import tensorflow as tf

    with NamedTemporaryFile(prefix="updater") as temp:
        blob.download_to_filename(temp.name)
        raw = tf.io.read_file(temp.name)

    return vectorize(raw, Path(blob.name).suffix)



parser = argparse.ArgumentParser("Indexer")
parser.add_argument("files", nargs="*")
parser.add_argument("--missing", "-m", action="store_true")


if __name__ == "__main__":
    args = parser.parse_args()
    if args.missing:
        PROJECT_ID = os.environ["PROJECT_ID"]
        BUCKET_NAME = f"{PROJECT_ID}-collector"
        bucket = storage.Client(project=PROJECT_ID).bucket(BUCKET_NAME)
        embeddings_file = "embeddings/index.json"
        embeddings: list[TEmbedding] = []
        new_embbeddings: list[TEmbedding] = []
        existing = set()
        if current_index_blob := bucket.get_blob(embeddings_file):
            for line in current_index_blob.download_as_text().splitlines():
                index_data: TEmbedding = json.loads(line)
                existing.add(index_data["id"])
                embeddings.append(index_data)


        updated = False
        for blob in bucket.list_blobs():
            blob: "Blob" = blob
            if blob.name == embeddings_file:
                continue

            blob_path = Path(blob.name)
            if blob_path.stem in existing:
                continue

            # vectorise this file and add it to the index
            print(f"Vectorizing {blob_path}...")
            embedding = vectorize_blob(blob)
            updated = True
            new_embbeddings.append({"id": blob_path.stem, "embedding": embedding})

        if updated:
            # append new embbeddings to the files.
            with bucket.blob(embeddings_file).open(mode="w") as f:
                for datapoint in chain(embeddings, new_embbeddings):
                    f.write(json.dumps(datapoint) + "\n")
            print(f"index.json successfully updated with {len(new_embbeddings)} new indexes.")
        else:
            print(f"Nothing to update.")
    else:
        for f in args.files:
            filename = Path(f)
            result = vectorize_file(f)
            with open(filename.with_suffix('.json'), mode='w') as w:
                json.dump(result, w)
