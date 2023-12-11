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

resource "google_project_service" "compute" {
  service = "compute.googleapis.com"
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
resource "google_project_iam_member" "web-app-owner" {
  project = data.google_project.project.project_id
  role    = "roles/owner"
  member  = "serviceAccount:${google_service_account.web-app.email}"
}

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
  location_id        = "northamerica-northeast1"
  type               = "FIRESTORE_NATIVE"
  
 }


/******************************************************
 * Cloud Storage bucket
 *
 * for embeddings
 */

resource "google_storage_bucket" "bucket" {
  name                        = "${data.google_project.project.project_id}-collector"
  location                    = "northamerica-northeast1"
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
}

// ACCESS

// https://cloud.google.com/storage/docs/access-control/iam-roles
resource "google_storage_bucket_iam_member" "web-app-bucket" {
  bucket = google_storage_bucket.bucket.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.web-app.email}"
}

// TODO: set so all user have acces
resource "google_storage_bucket_iam_member" "all-read-bucket" {
  bucket = google_storage_bucket.bucket.name
  role   = "roles/storage.objectReader"
  member = "allUsers"
}


/*
 * Network
 */

resource "google_compute_network" "collector-search" {
  name                    = "collector-search"
  auto_create_subnetworks = false
  routing_mode            = "GLOBAL"

  depends_on = [google_project_service.compute]
}

// https://cloud.google.com/vpc/docs/subnets#ip-ranges
resource "google_compute_subnetwork" "network-region" {
  name          = var.region
  ip_cidr_range = "10.128.0.0/20"
  region        = var.region
  network       = google_compute_network.collector-search.id
}

resource "google_compute_global_address" "psa-alloc" {
  name          = "psa-alloc"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.collector-search.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.collector-search.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa-alloc.name]

  depends_on = [google_project_service.servicenetworking]
}

# /*
#  * Compute Engine instance
#  */

data "google_compute_default_service_account" "default" {
  depends_on = [google_project_service.compute]
}

resource "google_compute_instance" "query-runner" {
  name         = "query-runner"
  machine_type = "n1-standard-2"
  zone         = "${var.region}-b"

  boot_disk {
    initialize_params {
      size  = "20"
      type  = "pd-balanced"
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    network    = google_compute_network.collector-search.name
    subnetwork = google_compute_subnetwork.network-region.name

    access_config {}
  }
  
  metadata_startup_script = file("./startup.sh")

  service_account {
    email  = data.google_compute_default_service_account.default.email
    scopes = ["cloud-platform"]
  }
}

resource "google_compute_firewall" "allow-internal" {
  name          = "collector-search-allow-internal"
  network       = google_compute_network.collector-search.name
  priority      = 65534
  source_ranges = ["10.128.0.0/9"]

  allow {
    protocol = "icmp"
  }

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
}

resource "google_compute_firewall" "allow-ssh" {
  name          = "collector-search-allow-ssh"
  network       = google_compute_network.collector-search.name
  priority      = 65534
  source_ranges = ["0.0.0.0/0"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
