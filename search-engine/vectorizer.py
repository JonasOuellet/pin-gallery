import os
import json
from itertools import chain
from pathlib import Path
from typing import TypedDict, TYPE_CHECKING
from tempfile import NamedTemporaryFile

import argparse

from google.cloud import storage
from google.cloud.aiplatform_v1 import (
    IndexServiceClient,
    UpsertDatapointsRequest,
    IndexDatapoint,
)

if TYPE_CHECKING:
    from google.cloud.storage.blob import Blob


class TEmbedding(TypedDict):
    id: str
    embedding: str


PROJECT_ID = os.environ["PROJECT_ID"]
REGION = os.environ["REGION"]

BUCKET_NAME = f"{PROJECT_ID}-collector"

INDEX_NAME = "collector"


parser = argparse.ArgumentParser("Indexer")
parser.add_argument("files", nargs="*")
parser.add_argument("--missing", "-m", action="store_true")


model = None


def vectorize(blob: "Blob") -> str:
    global model
    import tensorflow as tf
    import numpy as np

    if model is None:
        model = tf.keras.applications.EfficientNetB0(include_top=False, pooling="avg")

    with NamedTemporaryFile(prefix="updater") as temp:
        blob.download_to_filename(temp.name)
        raw = tf.io.read_file(temp.name)

    extension = Path(blob.name).suffix

    if extension.lower() == '.png':
        image = tf.image.decode_png(raw, channels=3)
    elif extension.lower() in ['jpeg', 'jpg']:
        image = tf.image.decode_jpeg(raw, channels=3)
    else:
        raise Exception(f"Invalid extension: {extension}")
    
    # https://keras.io/examples/vision/image_classification_efficientnet_fine_tuning/
    resized = tf.image.resize_with_pad(image, 224, 224)

    return model.predict(np.array([resized.numpy()]))[0].tolist()


if __name__ == "__main__":
    args = parser.parse_args()
    bucket = storage.Client(project=PROJECT_ID).bucket(BUCKET_NAME)
    if args.missing:
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
            embedding = vectorize(blob)
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
        API_ENDPOINT = f"{REGION}-aiplatform.googleapis.com"
        index = IndexServiceClient(client_options={"api_endpoint": API_ENDPOINT})

        datapoints = [] 
        for f in args.files:
            blob = bucket.blob(f)
            blob_path = Path(f)
            embedding = vectorize(blob)

            # https://github.com/googleapis/python-aiplatform/blob/v1.22.0/google/cloud/aiplatform_v1/types/index.py#L183
            datapoints.append(IndexDatapoint(datapoint_id=blob_path.stem, feature_vector=embedding))

        # https://github.com/googleapis/python-aiplatform/blob/v1.22.0/google/cloud/aiplatform_v1/types/index_service.py#L250
        upsert_req = UpsertDatapointsRequest(index=INDEX_NAME, datapoints=datapoints)

        # https://github.com/googleapis/python-aiplatform/blob/v1.22.0/google/cloud/aiplatform_v1/services/index_service/client.py#L1089
        response = index.upsert_datapoints(request=upsert_req)
        print(response)
