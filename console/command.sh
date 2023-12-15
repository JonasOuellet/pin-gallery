#!/bin/bash

. ./console/setenv.sh

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


./console/deploy.sh
