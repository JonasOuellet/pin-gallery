from typing import TYPE_CHECKING

from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
import numpy as np

if TYPE_CHECKING:
    from google.cloud.firestore import CollectionReference


from . import core


def _cluster(
    datapoints: np.ndarray,
    num_cluster: int
) -> tuple[np.ndarray, np.ndarray]:
    kmean = KMeans(n_clusters=num_cluster)
    clusterings = kmean.fit_predict(datapoints)
    distances = kmean.transform(datapoints)
    return clusterings, distances


def _split_cluster(
    cluster_id: int,
    datapoints: np.ndarray,
    indexes: list[str],
    size: int,
    dept: int = 1,
    data_reduction=False
) -> int:
    cluster_count = round(datapoints.shape[0] / size)

    tab = '    ' * (dept - 1)

    print(f"{tab}Splitting cluster {cluster_id} in {cluster_count}")

    if data_reduction:
        dimension = min(datapoints.shape[0], int(datapoints.shape[1] / 2))
        print(f"{tab}Appling PCA to reduce dimension from {datapoints.shape[1]} to {dimension}")
        pca = PCA(dimension)
        datapoints = pca.fit_transform(datapoints)

    clusters, distances = _cluster(datapoints, cluster_count)
    cluster_count = np.max(clusters)

    for cluster_idx in range(cluster_count + 1):
        cluster_item_indexes = np.nonzero(clusters == cluster_idx)[0]
        print(f"{tab}Cluster: {cluster_id} contain {len(cluster_item_indexes)} items.")

        # check for one value or less value
        numitem = len(cluster_item_indexes)
        if numitem <= 1:
            print(f"{tab}Skipping {numitem} items cluster..")
            for idx in cluster_item_indexes:
                dbid = indexes[idx]
                doc = core.get_item_collection().document(dbid)
                doc.update({
                    "cluster": -1,
                    "distance": 0 
                })
        elif dept <= 3 and len(cluster_item_indexes) > int(size * 1.5):
            cluster_id = _split_cluster(
                cluster_id,
                np.array([datapoints[idx] for idx in cluster_item_indexes], dtype=np.float32),
                [indexes[idx] for idx in cluster_item_indexes],
                size,
                dept + 1,
                data_reduction
            )
        else:
            print(f"{tab}Count is good.")
            for idx in cluster_item_indexes:
                dbid = indexes[idx]
                dist = float(distances[idx][cluster_idx])
                doc = core.get_item_collection().document(dbid)
                doc.update({
                    "cluster": cluster_id,
                    "distance": dist
                })

            cluster_id += 1

    return cluster_id


def cluster(
    size: int=20,
    no_data_reduction=False
):
    try:
        print("Loading datapoints...")
        datapoints = core.load_datapoints()
        print("Loading ids...")
        indexes = core.load_ids()
    except Exception as e:
        print("Error occured loading datapoints. download the data from the bucket")
        core.download_local_index()

        print("Loading datapoints...")
        datapoints = core.load_datapoints()
        print("Loading ids...")
        indexes = core.load_ids()

    if len(indexes) != datapoints.shape[0]:
        raise ValueError("Inconsistences in data.")

    num_vector = len(indexes)
    print(f"{num_vector} datapoints found.")
    _split_cluster(0, datapoints, indexes, size, data_reduction=not no_data_reduction)

    return
