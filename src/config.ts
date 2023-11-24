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

// This file contains the configuration options for this sample app.
import { readFileSync } from "fs";


interface Config {
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

    // The number of photos to load for search requests.
    photosToLoad: number,

    // The page size to use for search requests. 100 is reccommended.
    searchPageSize: number

    // The page size to use for the listing albums request. 50 is reccommended.
    albumPageSize: 50,

    // The API end point to use. Do not change.
    apiEndpoint: string
}

const OAUTH_INFO: any = JSON.parse(readFileSync("oAuthInfo.json", 'utf-8'));

export let config: Config = {
    oAuthClientID: OAUTH_INFO.clientID,
    oAuthClientSecret: OAUTH_INFO.secret,
    oAuthCallbackUrl: 'http://127.0.0.1:8080/auth/google/callback',
    port: 8080,
    scopes: [
        'https://www.googleapis.com/auth/photoslibrary.readonly',
        'https://www.googleapis.com/auth/photoslibrary.appendonly',
        'profile',
    ],
    photosToLoad: 150,
    searchPageSize: 100,
    albumPageSize: 50,
    apiEndpoint: 'https://photoslibrary.googleapis.com'
}




