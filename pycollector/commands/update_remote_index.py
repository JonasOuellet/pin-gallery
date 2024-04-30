from argparse import Namespace
from ..base_command import BaseCommand, register



class UpdateRemoteIndex(BaseCommand):

    def __init__(self) -> None:
        super().__init__("update-remote-index")

    def run(self, namespace: Namespace):
        # https://cloud.google.com/python/docs/reference/aiplatform/1.24.0/google.cloud.aiplatform_v1.services.index_service.IndexServiceClient
        from google.cloud.aiplatform_v1 import IndexServiceClient, UpsertDatapointsRequest, IndexDatapoint

        import time
        from .. import core

        client = IndexServiceClient(client_options={"api_endpoint": "northamerica-northeast1-aiplatform.googleapis.com"})
        
        indexes = core.load_ids()
        datapoints = core.load_datapoints()

        start = 0
        step = 1000
        for end in range(start + step, len(indexes), step):
            print(f"Updating from {start} to {end - 1}...")
            request = UpsertDatapointsRequest()
            request.index = "projects/339871598892/locations/northamerica-northeast1/indexes/3844103756937428992"

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

            print("Sleeping...", flush=True)
            time.sleep(30) # do only 2 request per minutes


register(UpdateRemoteIndex())
