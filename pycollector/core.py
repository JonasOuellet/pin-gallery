from typing import Iterable
import os
from pathlib import Path

import numpy as np

from google.cloud import storage, firestore, vision


PROJECT_ID = os.environ.get("PROJECT_ID", "macarons-410004")


storage_client = storage.Client(PROJECT_ID)
bucket = storage_client.get_bucket(f"{PROJECT_ID}-collector")

database = firestore.Client(PROJECT_ID, database="collector")
item_collection = database.collection("Users/rTw4N7tjtaxOR6y0YC98/items")

vision_client = vision.ImageAnnotatorClient()


class DownloadOrLocalImage:
    """Context manager to download an image.  Delete it after"""

    def __init__(self, imageid: str) -> None:
        self.filepath = Path(imageid)
        self.local = self.filepath.exists()
        self.filename = f"{imageid}.png"

    def __enter__(self, *args, **kwargs) -> str:
        if self.local:
            return str(self.filepath)

        blob = bucket.get_blob(self.filename)
        blob.download_to_filename(self.filename)
        return self.filename

    def __exit__(self, *args, **kwargs):
        if not self.local and os.path.exists(self.filename):
            os.remove(self.filename)


def detect_text(path: str) -> list[str]:
    """Detect the text in the specified local image"""
    # https://cloud.google.com/vision/docs/ocr?hl=fr

    with open(path, 'rb') as image_file:
        image = vision.Image(content=image_file.read())

    response = vision_client.text_detection(image=image)
    if response.error.message:
        raise Exception(
            "{}\nFor more info on error messages, check: "
            "https://cloud.google.com/apis/design/errors".format(response.error.message)
        )
    texts = response.text_annotations
    # the first text is the full sentence
    return [text.description for text in texts[1:]]


def encode_text(texts: list[str], dimension: int = 1280) -> np.ndarray | None:
    # maybe we need at least 5 unique ascii char
    out = np.zeros(dimension, dtype=np.float32)
    for text in texts:
        for l in text:
            idx = ord(l)
            if idx < dimension:
                out[idx] += 1

    if len(out[out > 0]) >= 3:
        return out

    # not enough distinc characters
    return None


def decode_text(data: Iterable[float]) -> dict[str, int]:
    out = {}
    for idx, n in enumerate(data):
        if n > 0:
            c = chr(idx)
            out[c] = int(n)
    return out


def get_all_items(start_id: str | None = None, start_after_id: str | None = None):
    query = item_collection.order_by("timestamp", direction="ASCENDING")
    if start_id:
        doc = item_collection.document(start_id)
        snapshot = doc.get()
        query = query.start_at(snapshot)
    elif start_after_id:
        doc = item_collection.document(start_after_id)
        snapshot = doc.get()
        query = query.start_after(snapshot)
    return query.get()


def load_ids() -> list[str]:
    with open("./ids.txt", mode='r') as f:
        return list(map(lambda x: x.strip(), f.readlines()))


def write_ids(ids: list[str]):
    with open("./ids.txt", mode='w') as f:
        for _id in ids:
            f.write(f"{_id}\n")


def load_datapoints() -> np.ndarray:
    return np.fromfile("./datapoints.bin", dtype=np.float32).reshape((-1, 1280))


def write_datapoints(arr: np.ndarray):
    arr.tofile("./datapoints.bin")


def upload_local_index():
    for file in ['ids.txt', 'datapoints.bin']:
        print(f"uploading {file}...")
        blob = bucket.blob(f'embeddings/{file}')
        blob.upload_from_filename(file)


def download_local_index():
    for file in ['ids.txt', 'datapoints.bin']:
        print(f"downloading {file}...")
        blob = bucket.blob(f'embeddings/{file}')
        blob.download_to_filename(file)