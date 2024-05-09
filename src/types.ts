import type {Timestamp} from "@google-cloud/firestore";

export enum IndexStatus{
    IndexValid,
    IndexDoesntExist,
    IndexNotDeployed,
    IndexIsBeingDeployed,
    IndexIsBeingUndeployed,
    IndexIsBeingCreated,
    EndpointIsBeingCreated
}


export interface User {
    username: string,
    password: Buffer,
    salt: Buffer,
    id: string,
    deployOperation: string | null,
    undeployOperation: string | null,
    dupDeployOperation: string | null | undefined,
    dupUndeployOperation: string | null | undefined,
    createIndexOperation: string | null,
    createEndPointOpreation: string | null
}


export interface DBItem {
    timestamp: FirebaseFirestore.Timestamp
}
