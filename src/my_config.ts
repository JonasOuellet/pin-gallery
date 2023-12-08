import { Config } from "./config";


export const config: Config = {
    projectName: "",
    bucketName: "",
    oAuthClientID: "",
    oAuthClientSecret: "",
    oAuthCallbackUrl: 'http://127.0.0.1:8080/auth/google/callback',
    port: 8080,
    scopes: [
        'https://www.googleapis.com/auth/photoslibrary.readonly',
        'https://www.googleapis.com/auth/photoslibrary.appendonly',
        'https://www.googleapis.com/auth/photoslibrary',
        'profile',
    ],
    apiEndpoint: 'https://photoslibrary.googleapis.com',
    firestore: {
        secret: "my-secret"
    }
}
