#!/bin/bash

. ./console/setenv.sh


if [ -z $1 ]
then
    version=1
    echo "Setting image version to 1"
else
    version=$1
    echo "Generating image version $version"
fi

# make sure everything is built before deploying new version.
npm run build

gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/collector-web-app/web-app:v$version"

gcloud run deploy \
  collector-web-app \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/collector-web-app/web-app:v$version"  \
  --region $REGION \
  --service-account "collector-web-app@$PROJECT_ID.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --set-env-vars "PROJECT_ID=$PROJECT_ID" \
  --set-env-vars "REGION=$REGION" \
  --cpu 4 \
  --memory 2Gi \
  --max-instances 1
