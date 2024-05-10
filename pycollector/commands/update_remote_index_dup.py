from argparse import Namespace
from ..base_command import BaseCommand, register



class UpdateRemoteIndex(BaseCommand):

    def __init__(self) -> None:
        super().__init__("update-remote-index-dup")

    def run(self, namespace: Namespace):
        # https://cloud.google.com/python/docs/reference/aiplatform/1.24.0/google.cloud.aiplatform_v1.services.index_service.IndexServiceClient
        from google.cloud.aiplatform_v1 import IndexServiceClient, UpsertDatapointsRequest, IndexDatapoint

        import time
        import numpy as np
        from .. import core

        client = IndexServiceClient(client_options={"api_endpoint": "northamerica-northeast1-aiplatform.googleapis.com"})
        
        with open("./dupids.txt", mode='r') as f:
            indexes = list(map(lambda x: x.strip(), f.readlines()))

        datapoints = np.fromfile("./dupdatapoints.bin", dtype=np.float32).reshape((-1, 1280))

        start = 0
        step = 1000

        first_time = True

        for end in range(start + step, len(indexes) + step, step):
            if not first_time:
                print("Sleeping...", flush=True)
                time.sleep(30) # do only 2 request per minutes
            
            end = min(end, len(indexes))

            print(f"Updating from {start} to {end - 1}...")
            request = UpsertDatapointsRequest()
            request.index = "projects/339871598892/locations/northamerica-northeast1/indexes/7889602859711332352"

            for idx, dt in zip(indexes[start:end], datapoints[start:end]):
                request.datapoints.append(
                    IndexDatapoint(
                        datapoint_id=idx,
                        feature_vector=dt.tolist() 
                    )
                )

            response = client.upsert_datapoints(request)
            # this returns nothing...
            # print(response)

            start = end
            first_time = False


register(UpdateRemoteIndex())
