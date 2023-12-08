// Copyright 2018 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

interface FireStoreConfig {
    secret: string
}


export interface Config {
    // google cloud project
    projectName: string,

    // The OAuth client ID from the Google Developers console.
    oAuthClientID: string,
    // The OAuth client secret from the Google Developers console.
    oAuthClientSecret: string,

    // The callback to use for OAuth requests. This is the URL where the app is
    // running. For testing and running it locally, use 127.0.0.1.
    oAuthCallbackUrl: string,

    // The port where the app should listen for requests.
    port: number,

    // The scopes to request. The app requires the photoslibrary.readonly and
    // plus.me scopes.
    scopes: string[]

    // The API end point to use. Do not change.
    apiEndpoint: string,

    // storage
    bucketName: string

    // firestore
    firestore: FireStoreConfig

}