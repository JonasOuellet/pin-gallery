import { createWriteStream, readFile} from "fs";
import { Firestore } from "@google-cloud/firestore";
import { IndexHandler, getIndexUtil } from '../ai_index';

import { User } from '../types';

export const projectID = process.env.PROJECT_ID;

export const db = new Firestore({
    projectId: projectID,
    databaseId: "collector"
});


export async function getUser(): Promise<User> {
    let userCol = await db.collection("Users")
        .where("username", "==", "Admin")
        .get();
    if (userCol.docs.length === 0) {
        return Promise.reject("Invalid username")
    }

    return userCol.docs[0].data() as User;
}


interface Item {
    [Key: string]: ItemData;
}


interface ItemData {
    text: string[] | undefined,
    vector: number[] | undefined
}


export async function getCollectionCount(
    user: User,
    collection: string
): Promise<number> {
    try {
        let userdoc = db.doc(`Users/${user.id}`);
        let col = userdoc.collection(collection);
        return (await col.count().get()).data().count;
    } catch (error) {
        return Promise.reject(error);
    }
}


export async function getItemData(
    user: User,
    collection: string
): Promise<Item>
{
    let out: Item = {};
    try {
        let userdoc = db.doc(`Users/${user.id}`);
        let col = userdoc.collection(collection);
        let documents = await col.listDocuments();
        for (let doc of documents) {
            let text: string[] | undefined = ((await doc.get()).data() || {}).text;
            out[doc.id] = {
                text: text,
                vector: undefined
            };
        }
        return out
    } catch (error) {
        return Promise.reject(error);
    }
}


export async function writeToFile(data: Item, filepath?: string): Promise<string> {
    let stream = createWriteStream(filepath || "itemdata.txt", {encoding: "utf-8"});
    stream.write(JSON.stringify(data, null));
    stream.close();
    return filepath || "itemdata.txt"
}


export async function readItemData(filename?: string): Promise<Item> {
    return new Promise((resolve, reject) => {
        readFile(filename || "itemdata.txt", (err, data) => {
            if (err) {
                return reject(err);
            }
            resolve(JSON.parse(data.toString()));
        })
    })
}


export async function vectorizeItems(items: Item) {
    try {
        // let user = await getUser()
        // let data = await getItemData(user, index);
        // await writeToFile(data);

        const indexUtil = getIndexUtil();
        await indexUtil.startPyCollector();
        let entries = Object.entries(items);
        let total = entries.length;
        let current = 1;
        for (let [key, value] of entries) {
            // vectorize the one that we have the text for
            if (value.vector === undefined) {
                try {
                    console.log(`[${current}/${total}] Vectorizing ${key}...`)
                    let result = await indexUtil.sendPyCollectorCommand({
                        command: "vectorize",
                        file: key,
                        text: value.text,
                    } as any)
                    value.vector = result.vector
                }
                catch (err) {
                    console.log(`Error parsing ${key}: ${err}`)
                }
            } 
            current += 1;
        }
        indexUtil.stopVectorizer();
    }
    catch (err) {
        console.error(err)
    }
}


export async function clearIndex(index: string, datapoints: string[]) {
    const indexHandler = new IndexHandler(index);
    const [aiInfo, err] = await indexHandler.getUndeployedAiInfo();
    if (err) {
        return Promise.reject(indexHandler.getErrorText(err));
    }
    if (aiInfo === null) {
        return Promise.reject("Impossible de d'acceder a l'index pour le moment");
    }

    let [response] = await getIndexUtil().indexClient.removeDatapoints({
        index: aiInfo.indexId,
        datapointIds: datapoints
    });
}



export async function insertDatapoints(index: string, datapoints: Item) {
    const dupIndexHandler = new IndexHandler(index);
    const [aiInfo, err] = await dupIndexHandler.getUndeployedAiInfo();
    if (err) {
        return Promise.reject(dupIndexHandler.getErrorText(err));
    }
    if (aiInfo === null) {
        return Promise.reject("Impossible de d'acceder a l'index pour le moment");
    }

    let dps: {datapointId: string, featureVector: number[]}[] = [];

    for (let [key, value] of Object.entries(datapoints)) {
        if (value.vector === undefined) {
            return Promise.reject(`${key} as vector is not set`)
        }
        dps.push({
            datapointId: key,
            featureVector: value.vector
        })
    }

    console.log(`uploading ${datapoints.length} datapoints...`)

    let response = await getIndexUtil().indexClient.upsertDatapoints({
        index: aiInfo.indexId,
        datapoints: dps 
    });
    console.log(response);
}