from pathlib import Path

from sklearn.neighbors import NearestNeighbors
import numpy as np

from . import core, core_tf


def _find(
    image: str,
    number: int
) -> list[tuple[str, float]]:
    vector = core_tf.vectorize_with_text(image)
    weights = core.load_datapoints()

    # use all processes
    nn = NearestNeighbors(n_jobs=-1)
    nn.fit(weights)

    distances, ids = nn.kneighbors(
        np.array([vector]),
        n_neighbors=number
    )
    strids =  core.load_ids()
    return list(zip((strids[x] for x in ids[0]), distances[0].tolist()))


def find(
    local_file_or_id: str,
    number: int = 5
) -> list[tuple[str, float]]:
    
    with core.DownloadOrLocalImage(local_file_or_id) as filepath:
        return _find(filepath, number)
