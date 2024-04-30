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
    cluster_items: np.ndarray | None,
    cluster_id: int,
    datapoints: np.ndarray,
    indexes: list[str],
    size: int,
    tab: str = '',
    dept: int = 1
) -> int:
    if cluster_items is not None:
        nncluster = round(cluster_items.shape[0] / size)
    else:
        nncluster = round(datapoints.shape[0] / size)

    print(f"{tab}Splitting cluster {cluster_id} in {nncluster}")

    if cluster_items is not None:
        new_dt = []
        new_indexes = []
        for _id in cluster_items:
            new_dt.append(datapoints[_id])
            new_indexes.append(indexes[_id])

        new_ndt = np.array(new_dt, dtype=np.float32)
    else:
        new_ndt = datapoints
        new_indexes = indexes

    new_cluster, new_dist = _cluster(new_ndt, nncluster)
    nncluster = np.max(new_cluster)

    for ncluster_id in range(nncluster + 1):
        cluster_items = np.nonzero(new_cluster == ncluster_id)[0]
        print(f"{tab}Cluster: {cluster_id} contain {len(cluster_items)} items.")

        # check for one value or less value
        numitem = len(cluster_items)
        if numitem <= 1:
            print(f"{tab}Skipping {numitem} items cluster..")
            for idx in cluster_items:
                dbid = new_indexes[idx]
                doc = core.item_collection.document(dbid)
                doc.update({
                    "cluster": -1,
                    "distance": 0 
                })
        elif dept <= 3 and len(cluster_items) > int(size * 1.5):
            cluster_id = _split_cluster(
                cluster_items,
                cluster_id,
                datapoints,
                indexes,
                size,
                tab + '  ',
                dept + 1
            )
        else:
            print(f"{tab}Count is good.")
            for idx in cluster_items:
                dbid = new_indexes[idx]
                dist = float(new_dist[idx][ncluster_id])
                doc = core.item_collection.document(dbid)
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
    
    if not no_data_reduction:
        print("Appling PCA to reduce dimension by 50%")
        dimension = int(datapoints.shape[1] / 2)

        pca = PCA(dimension)
        datapoints = pca.fit_transform(datapoints)

    num_vector = len(indexes)
    print(f"{num_vector} datapoints found.")
    _split_cluster(None, 0, datapoints, indexes, size)

    # for dbid, clustid, distance in zip(indexes, clusterings, distances):
    #     # get the number of items in this cluster


    return
        # distance = float(distance[cluster])
        # print(dbid, cluster, distance)

        # doc = core.item_collection.document(dbid)
        # if doc.get().exists:
        #     doc.update({
        #         "cluster": int(cluster),
        #         "distance": distance
        #     })
