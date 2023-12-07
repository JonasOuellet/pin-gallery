PROJECT_ID="focal-rig-407200"
REGION="northamerica-northeast1"

# to login
gloud auth login

# to set project
gcloud config set project $PROJECT_ID

# initialise les resource avec terraform
cd terraform
terraform init