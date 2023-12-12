#! /bin/bash
export PROJECT_ID="collector-407816"
export REGION="northamerica-northeast1"

# to set project
gcloud config set project $PROJECT_ID


# replace env var in startup script
envsubst < terraform/startup_src.sh > terraform/startup.sh

# initialise les resource avec terraform
cd terraform
terraform init

# confirm the plan
# this will only validate the plan
TF_VAR_project_id="$PROJECT_ID" TF_VAR_region="$REGION" terraform plan

# apply the plan/create the resources.
TF_VAR_project_id="$PROJECT_ID" TF_VAR_region="$REGION" terraform apply -auto-approve


# to deploy the container
# build the tsc code so we can add it to the container
npm install
npm run build

# set the admin password
node console/set_password.mjs

gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/collector-web-app/web-app:v1"

gcloud run deploy \
  collector-web-app \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/collector-web-app/web-app:v1"  \
  --region $REGION \
  --service-account "collector-web-app@$PROJECT_ID.iam.gserviceaccount.com" \
  --allow-unauthenticated

#   --cpu 4 \
#   --memory 2Gi \
#   --parallelism 2 \
#   --tasks 2 \
#   --execute-now
