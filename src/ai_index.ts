import * as ai from "@google-cloud/aiplatform";
import { ProjectsClient } from "@google-cloud/resource-manager";
import { google } from "@google-cloud/aiplatform/build/protos/protos";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { Socket, createServer} from "net";
import * as fs from "fs";


async function getPortFree(): Promise<number> {
    return new Promise( res => {
        const srv = createServer();
        srv.listen(0, () => {
            const port = (srv.address() as any).port
            srv.close((err) => res(port))
        });
    })
}

interface UndeployedAiInfo {
    indexId: string;
}


interface AiInfo extends UndeployedAiInfo{
    indexEndPoint: string;
    indexApiEndpoint: string;
    deployedIndex: string;
}


interface IPyCollectorCommand {
    command: string
}


interface IPyCollectorCommandVectorize {
    command: string,
    file: string,
    text?: string[]
}


interface IPyCollectorCommandNN extends IPyCollectorCommand {
    file: string,
    number?: number,
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


class IndexUtil {
    _project_id: string
    _region: string

    indexClient: ai.IndexServiceClient
    endPointClient: ai.IndexEndpointServiceClient 

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

        this.indexClient = new ai.IndexServiceClient({
            apiEndpoint: `${this._region}-aiplatform.googleapis.com`,
            projectId: this._project_id
        })
        
        this.endPointClient = new ai.IndexEndpointServiceClient ({
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
            socket.write(JSON.stringify({"command": "status"}), (err) => {
                if (err) {
                    resolve(false);
                }
            })
        });
    }

    async startVectorizerProxy(): Promise<void> {
        return new Promise((resolve, reject) => {resolve()});
    }

    async startPyCollector(): Promise<void> {
        // spawn process
        // if exit code is not null this means that the process is down.
        if (this._pythonProcess === null || this._pythonProcess.exitCode !== null) {
            this._pythonPort = await getPortFree();
            console.log(`Starting vectorizer on port ${this._pythonPort}`);
            this._pythonProcess = spawn("python", ["-m", "pycollector", "serve", "--port", this._pythonPort.toString(), "--init"]);
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

    stopVectorizer() {
        if (this._pythonProcess && this._pythonProcess.exitCode === null) {
            this._pythonProcess.kill();
            this._pythonProcess = null;
        }
    }

    async sendPyCollectorCommand(command: IPyCollectorCommand): Promise<any> {
        // make sure vectorizer is running
        await this.startPyCollector();
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
            socket.write(JSON.stringify(command), (err) => {
                if (err) {
                    reject(err);
                }
            })
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

}

let GLOBAL_INST: IndexUtil | null = null;

export function getIndexUtil(): IndexUtil {
    if (GLOBAL_INST === null) {
        GLOBAL_INST = new IndexUtil();
    }
    return GLOBAL_INST;
}


export class IndexHandler {

    // indexDisplayName: string = "collectorv2"
    // machineType: string = "e2-standard-16"
    indexDisplayName: string = "collector"
    endPointDisplayName: string = "collector"
    machineType: string = "e2-standard-2"

    constructor(indexName?: string, endPointName?: string) {

        if (indexName) {
            this.indexDisplayName = indexName;
        }

        if (endPointName) {
            this.endPointDisplayName = endPointName
        }
    }

    getErrorText(error: AiInfoErrType): string {
        switch (error) {
            case AiInfoErrType.IndexNotDeployed:
                return "L'index n'est pas deploye"
            case AiInfoErrType.IndexDoesntExist:
                return "L'index n'est pas encore cree"
        }
        return "";
    }

    /*
        const API_ENDPOINT = "0.northamerica-northeast1-720328317830.vdb.vertexai.goog"
        const INDEX_ENDPOINT = "projects/720328317830/locations/northamerica-northeast1/indexEndpoints/7034059667999293440"
        const DEPLOYED_INDEX_ID = "collector_search_indexv2_1702360075969"
        index id = "projects/720328317830/locations/northamerica-northeast1/indexes/54324670505156608"
    */
    async getUndeployedAiInfo(): Promise<[UndeployedAiInfo | null, AiInfoErrType | null]> {
        let index = await this.index();
        if (!index) {
            return [null, AiInfoErrType.IndexDoesntExist];
        }
        if (!index.name) {
            return [null, AiInfoErrType.InvalidDeployedIndex];
        }
        const indexId = index.name;
        return [{
            indexId: indexId,
        }, null];
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
        let deployedIndex: google.cloud.aiplatform.v1.IDeployedIndex | null = null;
        for (let depIndex of endPoint.deployedIndexes || []) {
            if (depIndex.index === index.name) {
                deployedIndex = depIndex;
                break;
            }
        }
        if (deployedIndex === null) {
            return [null, AiInfoErrType.IndexNotDeployed];

        }

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



    async index(): Promise<google.cloud.aiplatform.v1.IIndex | null> {
        let iterable = getIndexUtil().indexClient.listIndexesAsync({
            parent: getIndexUtil()._parentPath()
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
        let iterable = getIndexUtil().endPointClient.listIndexEndpointsAsync({
            parent: getIndexUtil()._parentPath()
        });
        for await (const response of iterable) {
            if (response.displayName === this.endPointDisplayName) {
                return response;
            }
        }
        return null
    }

    async createIndex(): Promise<string | null> {
        let index = await this.index();
        if (index !== null) {
            return null;
        }

        let glob = getIndexUtil()

        index = new google.cloud.aiplatform.v1.Index({
            displayName: this.indexDisplayName,
            indexUpdateMethod: "STREAM_UPDATE",
            metadata: { structValue: {
                fields: {
                    contentsDeltaUri: {stringValue: `gs://${glob._project_id}-collector/embeddings/`},
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

        const [operation] = await getIndexUtil().indexClient.createIndex({
            parent: glob._parentPath(),
            index: index
        });
        if (operation.name){
            return operation.name
        }

        return null;
        // return Promise.reject("Couldn't retrieve index operation name.")
    }

    async createEndPoint(): Promise<string | null> {
        let endPoint = await this.endPoint();
        if (endPoint !== null) {
            return null;
        }
        const [operation] = await getIndexUtil().endPointClient.createIndexEndpoint({
            parent: getIndexUtil()._parentPath(),
            indexEndpoint: {
                displayName: this.endPointDisplayName
            }
        });
        if (operation.name) {
            return operation.name;
        }
        return null;
        // return Promise.reject("Couldn't retrieve endpoint operation name.")
    }

    async generateIndex(): Promise<number> {
        return getIndexUtil().sendPyCollectorCommand({command: "missing"}).then((res) => {
            if (res.error) {
                return Promise.reject(res.error)
            }

            return res.status as number;
        })
    }

    async deployIndex(): Promise<string | null> {
        let [index, endpoint] = await Promise.all([this.index(), this.endPoint()]);
        if (!index) {
            return Promise.reject("Index is not created.")
        }
        if (!endpoint) {
            return Promise.reject("Endpoint is not created.")
        }
        if (!index.name) {
            return Promise.reject("Couldn't find index name.")
        }
        if (!endpoint.name) {
            return Promise.reject("Couldn't find endpoint name.")
        }
        try {
            let [response, operation] = await getIndexUtil().endPointClient.deployIndex({
                deployedIndex: {
                    id: `${this.indexDisplayName}_search_index`,
                    index: index.name,
                    displayName: `Deployed ${this.indexDisplayName} search index`,
                    dedicatedResources: {
                        machineSpec: {
                            machineType: this.machineType,
                        },
                        minReplicaCount: 1,
                        maxReplicaCount: 1,
                    }
                },
                indexEndpoint: endpoint.name
            })

            if (response.done) {
                return null;
            }
            if (operation && operation.name) {
                return operation.name
            }

        } catch (err) {
            // the index might be undeploying...
            console.log(err);
            return Promise.reject(`${err}`)
        }
        return null;
    }

    async startIndexCreation(): Promise<[string | null, string | null]> {
        return this.generateIndex()
            .then((_) =>{
                return Promise.all([this.createIndex(), this.createEndPoint()])
            })
    }

    async pyCollectorNN(
        filename: string,
        number?: number
    ): Promise<[string, number][]> {
        let cmd: IPyCollectorCommandNN = {
            command: "nearest-neighbors",
            file: filename,
            number: number,
        }
        return getIndexUtil().sendPyCollectorCommand(cmd).then((result) => {
            return result.nearest;
        })
    }

    async vectorizeLocalFileWithText(filename: string): Promise<{vector: number[], text: string[]}> {
        let command: IPyCollectorCommandVectorize = {
            command: "vectorize-with-text",
            file: filename
        };

        return getIndexUtil().sendPyCollectorCommand(command);
    }

    async vectorizeLocalFile(filename: string, text?: string[]): Promise<number[]> {
        let command: IPyCollectorCommandVectorize = {
            command: "vectorize",
            file: filename,
            text: text
        }
        return getIndexUtil().sendPyCollectorCommand(command)
            .then(async (result: {vector: number[]}) => {
                // check if file exists
                return result.vector
        })
    }

    async findSimilarLocal(filename: string, count: number = 5): Promise<{id: string, distance: number}[]> {
        return this.vectorizeLocalFile(filename)
        .then(async (vector) => {
            const [apiInfo, err] = await this.getAiInfo();
            if (err) {
                return Promise.reject(this.getErrorText(err));
            }
            if (apiInfo === null) {
                return Promise.reject("Impossible de d'acceder a l'index pour le moment");
            }

            let matchClient = new ai.MatchServiceClient({
                apiEndpoint: apiInfo.indexApiEndpoint,
                projectId: getIndexUtil()._project_id
            });
            return matchClient.findNeighbors({
                deployedIndexId: apiInfo.deployedIndex,
                indexEndpoint: apiInfo.indexEndPoint,
                returnFullDatapoint: false,
                queries: [
                    {
                        neighborCount: count,
                        datapoint: {featureVector: vector}
                    }
                ]
            })
        }).then(([response, request, obj]) => {
            let out: any[] = [];
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

    async addDataPoint(id: string, vector: number[]): Promise<void> {
        const [aiInfo, err] = await this.getUndeployedAiInfo();
        if (err) {
            return Promise.reject(this.getErrorText(err));
        }
        if (aiInfo === null) {
            return Promise.reject("Impossible de d'acceder a l'index pour le moment");
        }
        let response = await getIndexUtil().indexClient.upsertDatapoints({
            index: aiInfo.indexId,
            datapoints: [{
                datapointId: id,
                featureVector: vector
            }]
        });
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
            let [response, operation] = await getIndexUtil().endPointClient.undeployIndex({
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

    async checkCreateIndexOperation(name: string): Promise<boolean> {
        let response = await getIndexUtil().indexClient.checkCreateIndexProgress(name);
        if (response.done) {
            return true;
        }
        return false;
    }

    async checkCreateEndpointOperation(name: string): Promise<boolean> {
        let reponse = await getIndexUtil().endPointClient.checkCreateIndexEndpointProgress(name);
        if (reponse.done) {
            return true;
        }
        return false;
    }

    async checkDeployOperation(name: string): Promise<boolean> {
        let response = await getIndexUtil().endPointClient.checkDeployIndexProgress(name);
        if (response.done) {
            return true;
        }
        return false;
    }
    
    async checkUndeployOperation(name: string): Promise<boolean> {
        let response = await getIndexUtil().endPointClient.checkUndeployIndexProgress(name);
        if (response.done) {
            return true;
        }
        return false;
    }

    async removeItem(id: string): Promise<void> {
        const [aiInfo, err] = await this.getUndeployedAiInfo();
        if (err) {
            return Promise.reject(this.getErrorText(err));
        }
        if (aiInfo === null) {
            return Promise.reject("Impossible de d'acceder a l'index pour le moment");
        }

        let [response] = await getIndexUtil().indexClient.removeDatapoints({
            index: aiInfo.indexId,
            datapointIds: [id]
        });
    }

    async readDataPoint(id: string): Promise<number[]> {
        const [apiInfo, err] = await this.getAiInfo();
        if (err) {
            return Promise.reject(this.getErrorText(err));
        }
        if (apiInfo === null) {
            return Promise.reject("Impossible de d'acceder a l'index pour le moment");
        }

        let matchClient = new ai.MatchServiceClient({
            apiEndpoint: apiInfo.indexApiEndpoint,
            projectId: getIndexUtil()._project_id
        });

        try {
            let [result] = await matchClient.readIndexDatapoints({
                deployedIndexId: apiInfo.deployedIndex,
                indexEndpoint: apiInfo.indexEndPoint,
                ids: [id]
            });

            if (result.datapoints && result.datapoints.length > 0) {
                let dp = result.datapoints[0].featureVector;
                if (dp && dp.length > 0) {
                    return dp;
                }
            }
        } catch (err) {
        }
        return Promise.reject("Error reading id.")
    }

    async readDataPoints(ids: string[], callback: (datapoints: google.cloud.aiplatform.v1.IIndexDatapoint[]) => void): Promise<void> {
        const [apiInfo, err] = await this.getAiInfo();
        if (err) {
            return Promise.reject(this.getErrorText(err));
        }
        if (apiInfo === null) {
            return Promise.reject("Impossible de d'acceder a l'index pour le moment");
        }

        let matchClient = new ai.MatchServiceClient({
            apiEndpoint: apiInfo.indexApiEndpoint,
            projectId: getIndexUtil()._project_id
        });

        let current = 0;
        while (current <= ids.length) {
            let end = Math.min(ids.length, current + 1000);
            let [result] = await matchClient.readIndexDatapoints({
                deployedIndexId: apiInfo.deployedIndex,
                indexEndpoint: apiInfo.indexEndPoint,
                ids: ids.slice(current, end)
            });
            current += 1000;
            if (result.datapoints) {
                callback(result.datapoints);
            }
        }

    }

    async writeDataPointsToFile(ids: string[]): Promise<string> {
        let stream = fs.createWriteStream("datapoints.txt");
        this.readDataPoints(ids, (datapoints) => {
            for (let data of datapoints) {
                stream.write(JSON.stringify({id: data.datapointId, vector: data.featureVector}, null, 4));
            }
        });
        stream.close();
        return "datapoints.txt";
    }
}
