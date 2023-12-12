import * as ai from "@google-cloud/aiplatform";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { google } from "@google-cloud/aiplatform/build/protos/protos";
import { spawn } from "child_process";
import { readFile} from "fs/promises";
import { unlink } from "fs";


export class IndexHandler {
    _indexClient: ai.IndexServiceClient
    _endPointClient: ai.IndexEndpointServiceClient 
    _project_id: string
    _region: string
    _indexExists: boolean | null = null

    indexDisplayName: string = "collector"

    _indexEndPoint: string | null = null;
    _indexApiEndpoint: string | null = null;
    _deployedIndex: string | null = null;
    _indexId: string | null = null;

    _isCreatingIndex: boolean = false;

    constructor() {
        if (!process.env.PROJECT_ID) {
            throw new Error("PROJECT_ID env var not set.")
        }
        this._project_id = process.env.PROJECT_ID;
        if (!process.env.REGION) {
            throw new Error("REGION env var not set.")
        }
        this._region = process.env.REGION;

        this._indexClient = new ai.IndexServiceClient({
            apiEndpoint: `${this._region}-aiplatform.googleapis.com`,
            projectId: this._project_id
        })
        
        this._endPointClient = new ai.IndexEndpointServiceClient ({
            apiEndpoint: `${this._region}-aiplatform.googleapis.com`,
            projectId: this._project_id
        });
    }

    /*
        const API_ENDPOINT = "0.northamerica-northeast1-720328317830.vdb.vertexai.goog"
        const INDEX_ENDPOINT = "projects/720328317830/locations/northamerica-northeast1/indexEndpoints/7034059667999293440"
        const DEPLOYED_INDEX_ID = "collector_search_indexv2_1702360075969"
        index id = "projects/720328317830/locations/northamerica-northeast1/indexes/54324670505156608"
    */
    async getEndPointInfo(): Promise<[string, string, string, string]> {
        if (!(this._indexApiEndpoint && this._indexEndPoint && this._deployedIndex && this._indexId)) {
            let endPoint = await this.endPoint();
            if (!endPoint) {
                this._indexApiEndpoint = null;
                this._indexEndPoint = null;
                this._deployedIndex = null;
                return Promise.reject(new Error("Couldn't find index enpoint"))
            }
            // "0.northamerica-northeast1-720328317830.vdb.vertexai.goog"
            this._indexApiEndpoint = endPoint.publicEndpointDomainName || "";
            // "projects/720328317830/locations/northamerica-northeast1/indexEndpoints/7034059667999293440"
            this._indexEndPoint = endPoint.name || "";
            if (endPoint.deployedIndexes) {
                // "collector_search_indexv2_1702360075969"
                this._deployedIndex = endPoint.deployedIndexes[0].id || "";
                // "projects/720328317830/locations/northamerica-northeast1/indexes/54324670505156608"
                this._indexId = endPoint.deployedIndexes[0].index || "";
            } else {
                return Promise.reject(new Error("Index not deployed yet"));
            }
        }

        return [
            this._indexApiEndpoint,
            this._indexEndPoint,
            this._deployedIndex,
            this._indexId
        ]

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
        if (this._indexExists === null) {
            this._indexExists = await this.index() !== null;
        }
        return this._indexExists;
    }

    async endPoint(): Promise<google.cloud.aiplatform.v1.IIndexEndpoint | null> {
        let iterable = this._endPointClient.listIndexEndpointsAsync({
            parent: this._parentPath()
        });
        for await (const response of iterable) {
            // TODO: remove this v2
            if (response.displayName === this.indexDisplayName + "v2") {
                return response;
            }
        }
        return null
    }

    async createIndex(): Promise<[
        google.cloud.aiplatform.v1.IIndex,
        google.cloud.aiplatform.v1.ICreateIndexOperationMetadata | null,
        google.longrunning.Operation | null
    ]> {
        let index = await this.index();
        if (index !== null) {
            return [index, null, null];
        }

        index = new google.cloud.aiplatform.v1.Index({
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
        // reset stored value
        let ret = await operation.promise();
        this._indexExists = null;
        return ret;
    }

    async createEndPoint(): Promise<[
        google.cloud.aiplatform.v1.IEndpoint,
        google.cloud.aiplatform.v1.ICreateEndpointOperationMetadata | null,
        google.longrunning.Operation | null
    ]>{
        let endPoint = await this.endPoint();
        if (endPoint !== null) {
            return [endPoint, null, null];
        }
        let projectNumber = await this.projectNumber();
        const [operation] = await this._endPointClient.createIndexEndpoint({
            parent: this._parentPath(),
            indexEndpoint: {
                displayName: this.indexDisplayName
                // network: `projects/${projectNumber}/global/networks/collector-search`
            }
        });
        return await operation.promise();
    }

    generateIndex(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const process = spawn("python", ["vectorizer.py", "--missing"]);
            process.stdout.on('data', (data) => {
                console.log(`Process: ${data}`);
            })
            
            process.stderr.on('data', (data) => {
                console.log(`Process Error: ${data}`);
            })

            process.on('close', (code) => {
                if (code == 0) {
                    resolve(true);
                } else {
                    reject(new Error(`Process exited with code ${code}`));
                }
            });

            process.on('error', (err) => {
                reject(err);
            })
        });
    }

    startIndexCreation() {
        if (!this._isCreatingIndex) {
            this._isCreatingIndex = true;
            this.generateIndex()
                .then((_) =>{
                    return Promise.all([this.createIndex(), this.createEndPoint()])
                })
                .then(([[index, _indexMeta, _indexOpt], [endPoint, _endPointMeta, _endPointOpt]]) => {
                    if (!index.name) {
                        return Promise.reject("Couldn't find index name.")
                    }
                    return this._endPointClient.deployIndex({
                        deployedIndex: {
                            id: "collector_search_index",
                            index: index.name,
                            displayName: "Deployed collector search index",
                            dedicatedResources: {
                                machineSpec: {
                                    machineType: "e2-standard-2"
                                },
                                minReplicaCount: 1,
                                maxReplicaCount: 1
                            }
                        },
                        indexEndpoint: endPoint.name
                    })
                })
                .then(([_deployIndexResponse, metadata, _opt]) => {
                    // todo handle error.
                    if (metadata && metadata.error) {
                        return Promise.reject(new Error(`Error deploying index: ${metadata.error}`))
                    }
                })
                .catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    this._isCreatingIndex = false;
                    // reset so we fetch the value again
                    this._indexExists = null;
                })
        }
    }

    async vectorize_local_file(filename: string): Promise<number[]> {
        return new Promise<number[]>((resolve, reject) => {
            const process = spawn("python", ["vectorizer.py", filename]);
        
            process.stdout.on('data', (data) => {
                console.log(`Process: ${data}`);
            })
            
            process.stderr.on('data', (data) => {
                console.log(`Process Error: ${data}`);
            })

            process.on("close", async (code) => {
                if (code != 0) {
                    reject(new Error(`Vectorization process ended with exit code ${code}`));
                }

                // check if file exists
                const resultFile = filename.split('.')[0] + '.json'
                let data = JSON.parse(await readFile(resultFile, {encoding: 'ascii'}));
                unlink(resultFile, (err) => {if (err) {console.log(`Couldn't delete file ${resultFile}. ${err}`)}});
                resolve(data);
            })
        })
    }

    async find_similar_local(filename: string, count: number = 5): Promise<{id: string, distance: number}[]> {
        return this.vectorize_local_file(filename)
        .then(async (vector) => {
            // todo find those value.
            const [API_ENDPOINT, INDEX_ENDPOINT, DEPLOYED_INDEX_ID, INDEX] = await this.getEndPointInfo();

            let matchClient = new ai.MatchServiceClient({
                apiEndpoint: API_ENDPOINT,
                projectId: this._project_id
            });
            return matchClient.findNeighbors({
                deployedIndexId: DEPLOYED_INDEX_ID,
                indexEndpoint: INDEX_ENDPOINT,
                returnFullDatapoint: false,
                queries: [
                    {
                        neighborCount:5,
                        datapoint: {featureVector: vector}
                    }
                ]
            })
        }).then(([response, request, obj]) => {
            let out = [];
            if (response.nearestNeighbors && response.nearestNeighbors.length == 1) {
                if (response.nearestNeighbors[0].neighbors) {
                    for (let data of response.nearestNeighbors[0].neighbors) {
                        if (data.datapoint) {
                            out.push({
                                id: data.datapoint.datapointId || "",
                                distance: data.distance || 0
                            })
                        }
                    }
                }
            }
            return out;
        });
    }

    async addDataPoint(filename: string, id: string) {
        return this.vectorize_local_file(filename).then(async (vector) => {
            const [API_ENDPOINT, INDEX_ENDPOINT, DEPLOYED_INDEX_ID, INDEX] = await this.getEndPointInfo();
            let response = await this._indexClient.upsertDatapoints({
                index: INDEX,
                datapoints: [{
                    datapointId: id,
                    featureVector: vector
                }]
            })
            console.log(response);
        })
    }
}
