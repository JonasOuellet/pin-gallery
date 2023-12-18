# Pin Gallery


## Init sql db

```
psql -U prostgres collectionneurs
\i create_db.sql
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


mettre le bucket public:
... -> Modifier l'acces
ajouter un compte principal all user, lecture des objects.


if fire store stop working:

```
firebase login --reauth

gcloud auth application-default login
```
