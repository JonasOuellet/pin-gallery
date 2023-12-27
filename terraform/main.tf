/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}


terraform {
  required_version = "~> 1.3"

  required_providers {
    google = {
      source = "hashicorp/google"
      version = "5.8.0"
    }
  }
}


provider "google" {
  project = var.project_id
}

data "google_project" "project" {
  project_id = var.project_id
}

/*
 * APIs
 */

resource "google_project_service" "cloudservice" {
  service = "cloudresourcemanager.googleapis.com"
}

resource "google_project_service" "iamapi" {
  service = "iam.googleapis.com"
}

resource "google_project_service" "aiplatform" {
  service = "aiplatform.googleapis.com"
}

resource "google_project_service" "artifactregistry" {
  service = "artifactregistry.googleapis.com"
}

resource "google_project_service" "cloudbuild" {
  service = "cloudbuild.googleapis.com"
}

resource "google_project_service" "run" {
  service = "run.googleapis.com"
}

resource "google_project_service" "servicenetworking" {
  service = "servicenetworking.googleapis.com"
}


resource "google_project_service" "api_firestore_db" {
  service = "firestore.googleapis.com"
}


/******************************************************
  *  web app
  *
  */ 
resource "google_service_account" "web-app" {
  account_id   = "collector-web-app"
  display_name = "Service Account collector web app cloud run"
}

// all the web app access:


// set all access for now, juste for simplicity
// resource "google_project_iam_member" "web-app-owner" {
//   project = data.google_project.project.project_id
//   role    = "roles/owner"
//   member  = "serviceAccount:${google_service_account.web-app.email}"
// }

// accesss for the vectorizer to update index.
// https://cloud.google.com/vertex-ai/docs/general/access-control?hl=ja
resource "google_project_iam_member" "web-app-aiplatform-user" {
  project = data.google_project.project.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.web-app.email}"
}

// access to fire store
# https://cloud.google.com/firestore/docs/security/iam?hl=fr
resource "google_project_iam_member" "web-app-database" {
  project = data.google_project.project.project_id
  role    = "roles/datastore.owner"
  member  = "serviceAccount:${google_service_account.web-app.email}"
}


/******************************************************
  *  Create artifact repository
  *
  */ 
resource "google_artifact_registry_repository" "web_app" {
  location      = var.region
  repository_id = "collector-web-app"
  format        = "DOCKER"

  depends_on = [google_project_service.artifactregistry]
}


/******************************************************
 *  Fire store database
 *
 * https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/firestore_database
 */

 resource "google_firestore_database" "firestore_db" {
  name               = "collector"
  location_id        = var.region
  type               = "FIRESTORE_NATIVE"
  
 }


/******************************************************
 * Cloud Storage bucket
 *
 * for embeddings
 */

resource "google_storage_bucket" "bucket" {
  name                        = "${data.google_project.project.project_id}-collector"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
}

// ACCESS

// https://cloud.google.com/storage/docs/access-control/iam-roles
resource "google_storage_bucket_iam_member" "web-app-bucket" {
  bucket = google_storage_bucket.bucket.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.web-app.email}"
}
