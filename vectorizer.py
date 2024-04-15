import os
import sys
import json
from itertools import chain
from pathlib import Path
from typing import TypedDict, TYPE_CHECKING
from tempfile import NamedTemporaryFile

import tensorflow as tf
import numpy as np

from PIL import Image

import socket

from google.cloud import storage

if TYPE_CHECKING:
    from google.cloud.storage.blob import Blob


class TEmbedding(TypedDict):
    id: str
    embedding: str


IMG_SIZE = 224

MODEL = tf.keras.applications.EfficientNetB0(include_top=False, pooling="avg", weights="imagenet")


def _vectorize_file(filename: str) -> list[float]:
    img = Image.open(filename).convert("RGB")
    resized = np.array(img.resize([IMG_SIZE, IMG_SIZE]))
    # Image.fromarray(resized, mode="RGB").save("test.jpg")
    return MODEL.predict(np.array([resized]))[0].tolist()


def vectorize_blob(blob: "Blob") -> list[float]:
    with NamedTemporaryFile(prefix="updater") as temp:
        blob.download_to_filename(temp.name)
        return _vectorize_file(temp.name)


def cmd_vectorize_file(f: str):
    filename = Path(f)
    result = _vectorize_file(f)
    out = filename.with_suffix('.json')
    with open(out, mode='w') as w:
        json.dump(result, w)
    return out


def cmd_generate_missing() -> int:
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
        return len(new_embbeddings)
    else:
        print(f"Nothing to update.")
        return 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        port = int(sys.argv[2])
        print(f"Python is listenning on port: {port}")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", port))
        sock.listen()
        while True:
            conn, addr = sock.accept()
            with conn:
                received = conn.recv(1024).decode()
                response = {"error": "Invalid command"}
                try:
                    commands = received.split(' ')
                    if commands[0] == "vectorize":
                        file = commands[1]
                        res = cmd_vectorize_file(file)
                        response = {"filepath": res.as_posix()}
                    elif commands[0] == "status":
                        response = {"status": "running"}
                    elif commands[0] == "missing":
                        count = cmd_generate_missing()
                        response = {"status": count}
                except Exception as e:
                    response = {"error": str(e)}
                conn.sendall(json.dumps(response).encode())
