# Collector App

## How to setup project

1. Replace the project and region in `console/setenv.sh`
2. Apply the variable to the console with (Don't forget the '.' before)
```bash
. console/setenv.sh
```
3. Validate terraform resources.
```bash
cd terraform
terraform init
TF_VAR_project_id="$PROJECT_ID" TF_VAR_region="$REGION" terraform plan
```
4. Apply terraform resources.
```bash
TF_VAR_project_id="$PROJECT_ID" TF_VAR_region="$REGION" terraform apply -auto-approve
```
5. Activate any api that need to be activated.  Rerun step 4
6. go back to root `cd ..`
7. Set the admin password with `node console/set_password.mjs`
8. Setup npm and build the project.
```bash
npm install
npm run build
```
9. finally deploy the app
```bash
console/deploy.sh
```


## Trouver des images semblable

* [matching-engine-tutorial-for-image-search](https://github.com/GoogleCloudPlatform/matching-engine-tutorial-for-image-search/blob/main/TUTORIAL.md)
* [Vertex AI](https://cloud.google.com/vertex-ai/docs/vector-search/overview)
* [Milvus](https://milvus.io/docs/image_similarity_search.md)
* [Vertex AI Index](https://cloud.google.com/vertex-ai/docs/vector-search/create-manage-index)

Cout de vertex AI: [cost](https://cloud.google.com/vertex-ai/pricing?hl=fr#matchingengine)

## TODOs:

* Ameliorer la selection de la region lors de l'ajout d'une nouvelle photo
* Supporter la prise de photo a partir d'un appareil cellulaire
* Lister les image au public
* Lister les images avec fancy box dans mes collections
* Ajouter le time stamp sur les images dans la database
* je vais surement devoir storer les images sur le server pour regarder les images similaires.  Une version plus low rez fera l'affaire.


## Cloud Resource Manager API
Need to activate cloud resource manager api

# Run in a dev container

Pour les utilisateur windows.  Utiliser wsl

1. Installer cuda: https://docs.nvidia.com/cuda/wsl-user-guide/index.html
2. Installer `tensorflow[and-cuda]` https://www.tensorflow.org/install/pip
    * ajouter les environement variable https://stackoverflow.com/questions/60208936/cannot-dlopen-some-gpu-libraries-skipping-registering-gpu-devices
    * a l'ouverture de wsl: https://askubuntu.com/questions/730/how-do-i-set-environment-variables
3. 

Run this to authentificate the first time
```bash
gcloud auth application-default login
```

Once logged set the current project
```bash
gcloud config set project $PROJECT_ID
```

# Using WSL

Run this command in windows to be able to connect from any devices on the LAN
https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-a-wsl-2-distribution-from-your-local-area-network-lan

```bash
netsh interface portproxy add v4tov4 listenport=8080 listenaddress=0.0.0.0 connectport=8080 connectaddress=172.26.162.4
```