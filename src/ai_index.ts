import { IndexServiceClient, EndpointServiceClient } from "@google-cloud/aiplatform";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { google } from "@google-cloud/aiplatform/build/protos/protos";


export class IndexHandler {
    _indexClient: IndexServiceClient
    _endPointClient: EndpointServiceClient
    _project_id: string
    _region: string

    indexDisplayName: string = "collector"

    constructor() {
        if (!process.env.PROJECT_ID) {
            throw new Error("PROJECT_ID env var not set.")
        }
        this._project_id = process.env.PROJECT_ID;
        if (!process.env.REGION) {
            throw new Error("REGION env var not set.")
        }
        this._region = process.env.REGION;

        this._indexClient = new IndexServiceClient({
            apiEndpoint: `${this._region}-aiplatform.googleapis.com`,
            projectId: this._project_id
        })
        
        this._endPointClient = new EndpointServiceClient({
            apiEndpoint: `${this._region}-aiplatform.googleapis.com`,
            projectId: this._project_id
        });
    }

    _parentPath(): string {
        return `projects/${this._project_id}/locations/${this._region}`;
    }

    async projectNumber(): Promise<string> {
        const client = new ProjectsClient();
        let [project] = await client.getProject({
            name: `projects/${this._project_id}`
        })
        if (!project.name) {
            return Promise.reject("Error finding project.")
        }
        return (project.name as any).split('/')[1];
    }

    async index(): Promise<google.cloud.aiplatform.v1.IIndex | null> {
        let iterable = this._indexClient.listIndexesAsync({
            parent: this._parentPath()
        });
        for await (const response of iterable) {
            if (response.displayName === this.indexDisplayName) {
                return response;
            }
        }
        return null;
    }

    async indexExists(): Promise<boolean> {
        return await this.index() !== null;
    }

    async createIndex(): Promise<[
        google.cloud.aiplatform.v1.IIndex,
        google.cloud.aiplatform.v1.ICreateIndexOperationMetadata,
        google.longrunning.Operation
    ]> {
        let index = new google.cloud.aiplatform.v1.Index({
            displayName: this.indexDisplayName,
            indexUpdateMethod: "STREAM_UPDATE",
            metadata: { structValue: {
                fields: {
                    contentsDeltaUri: {stringValue: `gs://${this._project_id}-collector/embeddings/`},
                    config: {structValue: {
                        fields: {
                            dimensions: {numberValue: 1280},
                            approximateNeighborsCount: {numberValue: 100},
                            shardSize: {stringValue: "SHARD_SIZE_SMALL"},
                            algorithmConfig: {structValue: {
                                fields: {
                                    treeAhConfig: {structValue: {
                                        fields: {}
                                    }}
                                }
                            }}
                        }
                    }}
                }
            }}
        });

        const [operation] = await this._indexClient.createIndex({
            parent: this._parentPath(),
            index: index
        });
        return await operation.promise();
    }

    async createEndPoint(): Promise<[
        google.cloud.aiplatform.v1.IEndpoint,
        google.cloud.aiplatform.v1.ICreateEndpointOperationMetadata,
        google.longrunning.Operation
    ]>{
        let projectNumber = await this.projectNumber();
        const [operation] = await this._endPointClient.createEndpoint({
            parent: this._parentPath(),
            endpoint: {
                displayName: this.indexDisplayName,
                network: `projects/${projectNumber}/global/networks/collector-search`
            }
        });
        return await operation.promise();
    }
}
