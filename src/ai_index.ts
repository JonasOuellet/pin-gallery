import * as ai from "@google-cloud/aiplatform";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { google } from "@google-cloud/aiplatform/build/protos/protos";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { readFile} from "fs/promises";
import { Socket, createServer} from "net";
import { unlink } from "fs";


async function getPortFree(): Promise<number> {
    return new Promise( res => {
        const srv = createServer();
        srv.listen(0, () => {
            const port = (srv.address() as any).port
            srv.close((err) => res(port))
        });
    })
}


interface AiInfo {
    indexEndPoint: string;
    indexId: string;
    indexApiEndpoint: string;
    deployedIndex: string;
}


export enum AiInfoErrType {
    IndexDoesntExist,
    EndPointDoesntExist,
    InvalidEndPointName,
    InvalidEndPointDomain,
    IndexNotDeployed,
    InvalidDeployedIndexId,
    InvalidDeployedIndex
}


export class IndexHandler {
    _indexClient: ai.IndexServiceClient
    _endPointClient: ai.IndexEndpointServiceClient 
    _project_id: string
    _region: string

    indexDisplayName: string = "collector"

    _indexEndPoint: string | null = null;
    _indexApiEndpoint: string | null = null;
    _deployedIndex: string | null = null;
    _indexId: string | null = null;

    _isCreatingIndex: boolean = false;

    _pythonProcess: ChildProcessWithoutNullStreams | null = null;

    _pythonPort: number = 0;

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

    async testVectorizer(): Promise<boolean> {
        return new Promise((resolve, reject) => {
            let socket = new Socket();
            socket.on("error", (err) => {
                resolve(false);
            })
            socket.on("data", (data) => {
                let result = JSON.parse(data.toString());
                if (result.status && result.status == "running") {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            socket.on("timeout", () => {
                resolve(false);
            })

            socket.connect({port: this._pythonPort});
            socket.write("status", (err) => {
                if (err) {
                    resolve(false);
                }
            })
        });
    }

    async startVectorizerProxy(): Promise<void> {
        return new Promise((resolve, reject) => {resolve()});
    }

    async startVectorizer(): Promise<void> {
        // spawn process
        // if exit code is not null this means that the process is down.
        if (this._pythonProcess === null || this._pythonProcess.exitCode !== null) {
            this._pythonPort = await getPortFree();
            console.log(`Starting vectorizer on port ${this._pythonPort}`);
            this._pythonProcess = spawn("python", ["vectorizer.py", "serve", this._pythonPort.toString()]);
            this._pythonProcess.stdout.on("data", (chunk: Buffer) => console.log(chunk.toString()));
            this._pythonProcess.stderr.on("data", (chunk: Buffer) => console.log(chunk.toString()));

            // wait for process to start
            console.log("Waiting for vectorizer to be ready....")
            while (true) {
                if (await this.testVectorizer()) {
                    console.log("Vectorizer is ready");
                    return;
                }
            }
        };
    }

    async sendVectorizerCommand(command: string): Promise<any> {
        // make sure vectorizer is running
        await this.startVectorizer();
        return new Promise((resolve, reject) => {
            let socket = new Socket();
            socket.on("error", (err) => {
                reject(err);
            })
            socket.on("data", (data) => {
                let result = JSON.parse(data.toString());
                if (result.error) {
                    reject(result.error);
                } else {
                    resolve(result);
                }
            })
            socket.on("timeout", () => {
                reject(new Error("Socket timed out."))
            })

            socket.connect({port: this._pythonPort});
            socket.write(command, (err) => {
                if (err) {
                    reject(err);
                }
            })
        });
    }

    /*
        const API_ENDPOINT = "0.northamerica-northeast1-720328317830.vdb.vertexai.goog"
        const INDEX_ENDPOINT = "projects/720328317830/locations/northamerica-northeast1/indexEndpoints/7034059667999293440"
        const DEPLOYED_INDEX_ID = "collector_search_indexv2_1702360075969"
        index id = "projects/720328317830/locations/northamerica-northeast1/indexes/54324670505156608"
    */
    async getAiInfo(): Promise<[AiInfo | null, AiInfoErrType | null]> {
        let [endPoint, index] = await Promise.all([this.endPoint(), this.index()]);
        if (!index) {
            return [null, AiInfoErrType.IndexDoesntExist];
        }
        if (!index.name) {
            return [null, AiInfoErrType.InvalidDeployedIndex];
        }
        const indexId = index.name;
        if (!endPoint) {
            return [null, AiInfoErrType.EndPointDoesntExist];
        };
        if (!endPoint.name) {
            return [null, AiInfoErrType.InvalidEndPointName];
        };
        const indexEndPoint = endPoint.name
        if (!endPoint.publicEndpointDomainName) {
            return [null, AiInfoErrType.InvalidEndPointDomain];
        }
        const indexApiEndpoint = endPoint.publicEndpointDomainName;
        if (!endPoint.deployedIndexes || endPoint.deployedIndexes.length == 0) {
            return [null, AiInfoErrType.IndexNotDeployed];
        }
        const deployedIndex = endPoint.deployedIndexes[0];
        if (!deployedIndex.id) {
            return [null, AiInfoErrType.InvalidDeployedIndexId];
        }
        const deployedIndexId = deployedIndex.id;
        
        return [{
            indexEndPoint: indexEndPoint,
            indexId: indexId,
            deployedIndex: deployedIndexId,
            indexApiEndpoint: indexApiEndpoint

        }, null];
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

    async endPoint(): Promise<google.cloud.aiplatform.v1.IIndexEndpoint | null> {
        let iterable = this._endPointClient.listIndexEndpointsAsync({
            parent: this._parentPath()
        });
        for await (const response of iterable) {
            if (response.displayName === this.indexDisplayName) {
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
        // let projectNumber = await this.projectNumber();
        const [operation] = await this._endPointClient.createIndexEndpoint({
            parent: this._parentPath(),
            indexEndpoint: {
                displayName: this.indexDisplayName
            }
        });
        return await operation.promise();
    }

    async generateIndex(): Promise<number> {
        return this.sendVectorizerCommand("missing").then((res) => {
            if (res.error) {
                return Promise.reject(res.error)
            }

            return res.status as number;
        })
    }

    async deployIndex(): Promise<string | null> {
        return Promise.all([this.createIndex(), this.createEndPoint()])
            .then(async ([[index, _indexMeta, _indexOpt], [endPoint, _endPointMeta, _endPointOpt]]) => {
                if (!index.name) {
                    return Promise.reject("Couldn't find index name.")
                }
                try {
                    let [response, operation] = await this._endPointClient.deployIndex({
                        deployedIndex: {
                            id: "collector_search_index",
                            index: index.name,
                            displayName: "Deployed collector search index",
                            dedicatedResources: {
                                machineSpec: {
                                    machineType: "e2-standard-2",
                                },
                                minReplicaCount: 1,
                                maxReplicaCount: 1,
                            }
                        },
                        indexEndpoint: endPoint.name
                    })

                    if (response.done) {
                        return null;
                    }
                    if (operation && operation.name) {
                        return operation.name
                    }

                } catch (err) {
                    // the index might be undeploying...
                    return null;
                }
                return null;
            })
    }

    startIndexCreation() {
        if (!this._isCreatingIndex) {
            this._isCreatingIndex = true;
            this.generateIndex()
                .then((_) =>{
                    return this.deployIndex();
                })
                .catch((err) => {
                    console.log(err);
                })
                .finally(() => {
                    this._isCreatingIndex = false;
                })
        }
    }

    async vectorize_local_file(filename: string): Promise<number[]> {
        return this.sendVectorizerCommand(`vectorize ${filename}`)
            .then(async (result: {filepath: string}) => {
                // check if file exists
                let data = JSON.parse(await readFile(result.filepath, {encoding: 'ascii'}));
                unlink(result.filepath, (err) => {if (err) {console.log(`Couldn't delete file ${result.filepath}. ${err}`)}});
                return data;
        })
    }

    async find_similar_local(filename: string, count: number = 5): Promise<{id: string, distance: number}[]> {
        return this.vectorize_local_file(filename)
        .then(async (vector) => {
            // todo find those value.
            const [apiInfo, err] = await this.getAiInfo();
            if (err || apiInfo === null) {
                // TODO: add a method to get text from error
                return Promise.reject(err);
            }

            let matchClient = new ai.MatchServiceClient({
                apiEndpoint: apiInfo.indexApiEndpoint,
                projectId: this._project_id
            });
            return matchClient.findNeighbors({
                deployedIndexId: apiInfo.deployedIndex,
                indexEndpoint: apiInfo.indexEndPoint,
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
                            });
                        }
                    }
                }
            }
            return out;
        });
    }

    async addDataPoint(filename: string, id: string) {
        return this.vectorize_local_file(filename).then(async (vector) => {
            const [aiInfo, err] = await this.getAiInfo();
            if (err || aiInfo === null) {
                // TODO: better handle the err here.
                return Promise.reject(err);
            }
            let response = await this._indexClient.upsertDatapoints({
                index: aiInfo.indexId,
                datapoints: [{
                    datapointId: id,
                    featureVector: vector
                }]
            });
        })
    }

    async isIndexDeployed(): Promise<boolean> {
        const [aiInfo, err] = await this.getAiInfo();
        if (err || aiInfo === null) {
            return false;
        }
        return true;
    }

    async undeployIndex(): Promise<string | null> {
        const [aiInfo, err] = await this.getAiInfo();
        if (err || aiInfo === null) {
            return null;
        }
        try {
            let [response, operation] = await this._endPointClient.undeployIndex({
                deployedIndexId: aiInfo.deployedIndex,
                indexEndpoint: aiInfo.indexEndPoint
            });
            // this will always return true for some reason.
            // if (response.done) {
            //     return null;
            // }
            if (operation && operation.name) {
                return operation.name
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    async checkDeployOperation(name: string): Promise<boolean> {
        let response = await this._endPointClient.checkDeployIndexProgress(name);
        if (response.done) {
            return true;
        }
        return false;
    }
    
    async checkUndeployOperation(name: string): Promise<boolean> {
        let response = await this._endPointClient.checkUndeployIndexProgress(name);
        if (response.done) {
            return true;
        }
        return false;
    }
}
