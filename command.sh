PROJECT_ID="focal-rig-407200"
REGION="northamerica-northeast1"

# to login
gloud auth login

# to set project
gcloud config set project $PROJECT_ID

# initialise les resource avec terraform
cd terraform
terraform init

# confirm the plan
# this will only validate the plan
TF_VAR_project_id="$PROJECT_ID" terraform plan

# apply the plan/create the resources.
TF_VAR_project_id="$PROJECT_ID" terraform apply -auto-approve