import bodyParser from 'body-parser';
import express from "express";
import * as multer from 'multer';
import passport from 'passport';
import { Strategy } from 'passport-local';
import session from 'express-session';
import * as crypto from "crypto";

import { Storage } from "@google-cloud/storage";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { FirestoreStore } from '@google-cloud/connect-firestore';

import { existsSync, mkdirSync, renameSync, unlink } from 'fs';
import * as path from "path";

import { IndexHandler, AiInfoErrType } from './ai_index';

import { User, IndexStatus } from './types';

export const app: express.Express = express();

app.set("view engine", "ejs");

// Disable browser-side caching for demo purposes.
app.disable('etag');

app.set("views", "./views");

// Set up static routes for hosted libraries.
app.use(express.static("./static"));

const ITEM_TO_BUILD_INDEX = 10;
const projectID = process.env.PROJECT_ID;
const SIMILAR_ITEM_SEARCH_FIELD = "similarItem"

// setup firestore
// https://cloud.google.com/firestore/docs/emulator?hl=fr
// TODO: fill settings
const db = new Firestore({
    projectId: projectID,
    databaseId: "collector"
});

const storage = new Storage({
    projectId: projectID
});
const bucket = storage.bucket(projectID + "-collector");

const indexHandler = new IndexHandler();

app.use(
    session({
        store: new FirestoreStore({
            dataset: db,
            kind: 'express-sessions'
        }),
        secret: projectID + "collector",
        resave: false,
        saveUninitialized: false
    })
);

/* Configure password authentication strategy.
 *
 * The `LocalStrategy` authenticates users by verifying a username and password.
 * The strategy parses the username and password from the request and calls the
 * `verify` function.
 *
 * The `verify` function queries the database for the user record and verifies
 * the password by hashing the password supplied by the user and comparing it to
 * the hashed password stored in the database.  If the comparison succeeds, the
 * user is authenticated; otherwise, not.
 */
passport.use(new Strategy(async (username, password, cb) => {
    let userCol = await db.collection("Users")
        .where("username", "==", username)
        .get();
    if (userCol.docs.length === 0) {
        return cb(null, false, {message: 'Invalid user name'});
    }
    let user = userCol.docs[0].data() as User;
    crypto.pbkdf2(password, user.salt, 310000, 32, 'sha256', (err, hashedPassword) => {
        if (err) {return cb(err)};
        if (!crypto.timingSafeEqual(user.password, hashedPassword)) {
            return cb(null, false, { message: 'Incorrect username or password.' });
        }
        return cb(null, user);
    })
    }));
    
	  
/* Configure session management.
*
* When a login session is established, information about the user will be
* stored in the session.  This information is supplied by the `serializeUser`
* function, which is yielding the user ID and username.
*
* As the user interacts with the app, subsequent requests will be authenticated
* by verifying the session.  The same user information that was serialized at
* session establishment will be restored when the session is authenticated by
* the `deserializeUser` function.
*
* Since every request to the app needs the user ID and username, in order to
* fetch todo records and render the user element in the navigation bar, that
* information is stored in the session.
*/
passport.serializeUser((user, done) => {
    process.nextTick(() => {
        done(null, { id: (user as any).id, username: (user as any).username });
    });
});

passport.deserializeUser((user, done) => {
    process.nextTick(() => {
        return done(null, user as any);
    });
});


const multerStorage = multer.diskStorage({
    destination: (req, file: Express.Multer.File, cb) => {
        cb(null, "./")
    },
    filename: (req, file: Express.Multer.File, cb) => {
        let splitted = file.mimetype.split('/');
        if (splitted[0] === "image") {
            const imageUUID = crypto.randomUUID();
            cb(null, `${imageUUID}.${splitted[1]}`);
        }
        else {
            cb(new Error(`Invalid mime type: (${splitted[0]})`), "");
        }
        }
});
// const multerMemoryStorage = multer.memoryStorage();
const upload = multer.default({storage: multerStorage});

// Parse application/json request data.
app.use(bodyParser.json());

// Parse application/xwww-form-urlencoded request data.
app.use(bodyParser.urlencoded({ extended: true }));

// Set up passport and session handling.
app.use(passport.authenticate('session'));

function getIp(req: express.Request): string | null {
    if (req.ip) {
        let ips = req.ip.split(":")
        return ips[ips.length - 1];
    }
    return null
}

async function getConnectionIp(req: express.Request)  {
    let ip = getIp(req);
    if (ip) {
        let ipcol = await db.collection("connections").where("ip", "==", ip).limit(1).get();
        if (ipcol.docs && ipcol.docs.length > 0) {
            return ipcol.docs[0]
        }
    }
    return null;
};


app.get('/', async (req, res) => {
    if (req.user && req.isAuthenticated()) {
        let user = db.doc(`Users/${(req.user as any).id}`);
        let data = await user.collection("items").count().get();
        res.locals.nbitems = data.data().count;
        res.locals.similarCount = (await user.get()).get(SIMILAR_ITEM_SEARCH_FIELD) || 5;
        return res.render('pages/index');
    }
    return res.render("pages/login");
});


app.get('/indexstatus', async (req, res) => {
    let user = req.user as User;
    if (!req.user || req.isUnauthenticated()) {
        return res.status(401).send("Unautorized.")
    }

    try {
        let userDoc = db.doc(`Users/${user.id}`);
        let userData = (await userDoc.get()).data() as User | undefined;
        
        // first check if there are operations
        if (userData) {

            if (userData.createIndexOperation) {
                if (await indexHandler.checkCreateIndexOperation(userData.createIndexOperation)) {
                    await userDoc.update({
                        createIndexOperation: null
                    });
                }
                else {
                    return res.send(({
                        status: IndexStatus[IndexStatus.IndexIsBeingCreated]
                    }))
                }
            }
            
            if (userData.createEndPointOpreation) {
                if (await indexHandler.checkCreateEndpointOperation(userData.createEndPointOpreation)) {
                    await userDoc.update({
                        createEndPointOpreation: null
                    });
                }
                else {
                    return res.send(({
                        status: IndexStatus[IndexStatus.EndpointIsBeingCreated]
                    }))
                }
            }

            if (userData.deployOperation) {
                // query google to see if the operation is completed. or in progress
                if (await indexHandler.checkDeployOperation(userData.deployOperation)) {
                    // remove the operation from the the user
                    await userDoc.update({
                        deployOperation: null
                    });
                } else {
                    return res.send({
                        status:  IndexStatus[IndexStatus.IndexIsBeingDeployed]
                    })
                }
            }
            if (userData.undeployOperation) {
                // query google to see if the operation is completed. or in progress
                if (await indexHandler.checkUndeployOperation(userData.undeployOperation)) {
                    // remove the operation from the the user
                    await userDoc.update({
                        undeployOperation: null
                    });
                } else {
                    return res.send({
                        status:  IndexStatus[IndexStatus.IndexIsBeingUndeployed]
                    })
                }
            }
        }

        const [info, err] = await indexHandler.getAiInfo();

        if (err !== null) {
            if (err === AiInfoErrType.IndexDoesntExist) {
                // check how many image we have yet
                let count = (await db.doc(`Users/${user.id}`)
                    .collection("items")
                    .count()
                    .get()
                ).data().count;
                
                return res.send({
                    currentItemCount: count,
                    itemNeeded: ITEM_TO_BUILD_INDEX,
                    remaining: Math.max(0, ITEM_TO_BUILD_INDEX - count),
                    status: IndexStatus[IndexStatus.IndexDoesntExist]
                });
            }
            if (err === AiInfoErrType.EndPointDoesntExist) {
                
            } 
            else if (err === AiInfoErrType.IndexNotDeployed) {
                // check if there is a task to deploy the index and check if it is finished
                return res.status(200).send({
                    status: IndexStatus[IndexStatus.IndexNotDeployed]
                })
            }
        }

        return res.send({
            status: IndexStatus[IndexStatus.IndexValid]
        })

    } catch (err) {
        return res.status(400).send({error: err})
    }
});


app.post('/login', async (req, res, next) => {
    let connData = await getConnectionIp(req);
    let num_try = 0;
    if (connData) {
        num_try = connData.data().num_try;
    }

    // the user has tried more than five time reject the requests.
    if (num_try >= 5) {
        return res.status(401).send("Unauthorized.");
    }

    // increase num try
    num_try += 1;
    let data =  {
        num_try: num_try,
        host: req.hostname,
        ip: getIp(req)
    }
    let doc;
    if (connData) {
        doc = db.doc(`connections/${connData.id}`);
        await doc.update(data);
    } else {
        doc = db.collection("connections").doc();
        doc.set(data);
    }
    res.locals.docid = doc.id;

    next();
},
passport.authenticate('local', {failureRedirect: "/"}), 

async (req, res, next) => {
    try {
        await db.doc(`connections/${res.locals.docid}`).delete();
    } catch (err) {
        console.log(err);
    }
    return res.redirect('/');
});


app.post('/item/create', upload.single('image'), async (req, res) => {
    let user = req.user as User;
    if (user === undefined || req.isUnauthenticated()) {
        return res.status(401).send("unauthorized")
    }
    
    let file = req.file;
    if (file === undefined) {
        return res.status(400).send("Couldn't fetch file from request.")
    }
    // create a new item so we can have the id
    let doc = db.doc(`Users/${user.id}`)
        .collection("items")
        .doc();

    let ext = path.extname(file.filename);
    let destination = doc.id + ext;

    try {
        let [bucketFile] = await bucket.upload(file.path, {destination: destination});
        await doc.set({timestamp: Timestamp.now()});
        if (await indexHandler.indexExists()) {
            // update the index
            await indexHandler.addDataPoint(
                file.path,
                doc.id
            )
        }
        res.send({url: bucketFile.publicUrl()});
    } 
    catch (err) {
        unlink(file.path, () => {});
        return res.status(400).send(`Error Occured: ${err}`)
    }
    finally {
        // delete the files in the image folder
        unlink(file.path, (err) => {
            if (err) {
                console.log(`Error occured deleting file: ${err}`)
            }    
        });    
    }    
    
});


app.get('/item/delete/:id', async (req, res) => {
    let user = req.user as User;
    if (user === undefined || req.isUnauthenticated()) {
        return res.status(401).send("unauthorized")
    }
    try {
        await indexHandler.removeItem(req.params.id);
    } catch (err) {
        return res.status(400).send(err);
    }
    // remove it from the db
    try {
        await db.doc(`Users/${user.id}`).collection("items").doc(req.params.id).delete();
    } catch (err) {
        return res.status(400).send("Impossible de supprimer l'item de la base de donnee.")
    }
    
    try {
        await bucket.file(`${req.params.id}.png`).delete({ignoreNotFound: false});
    } catch (err) {
        return res.status(400).send("Impossible de supprimer l'item du stockage.")
    }

    return res.send("Item removed with success.")
});


app.get('/items/count', async (req, res) => {
    let user = req.user as User;
    if (user === undefined || req.isUnauthenticated()) {
        return res.status(401).send("unauthorized")
    }

    try {
        let count = await db.doc(`Users/${user.id}`).collection("items").count().get();
        return res.send({"count": count.data().count});
    } catch (err) {
        return res.status(400).send(err);
    }
});


app.post('/item/similarimage', upload.single('image'), async (req, res) => {
    let user = req.user as User;
    if (!user || req.isUnauthenticated()) {
        return res.status(400).send("Invalid user.");
    }
    
    let file = req.file;
    if (file === undefined) {
        // TODO: handle error here
        return res.status(400).send("File not defined.");
    }

    let count = 5;
    try {
        count = Math.min(50, Math.max(2, parseInt(req.body.count, 10)));
    } catch {}
    
    let obj: any = {};
    obj[SIMILAR_ITEM_SEARCH_FIELD] = count;
    db.doc(`Users/${user.id}`).update(obj).catch((reason) => {
        console.log("Couldn't update similar item count: ", reason)
    });

    try {
        let result = await indexHandler.findSimilarLocal(file.path, count);
        let urls: {url: string, distance: number}[] = [];
        for (let r of result) {
            urls.push({
                url: bucket.file(`${r.id}.png`).publicUrl(),
                distance: r.distance
            });
        }
        res.send({
            results: urls
        });

    } catch (err) {
        res.status(400).send(err);
    }
    finally {
        unlink(file.path, () => {});
    }

});


app.get('/items/read', async (req, res) => {
    try {
        let adminUser = await db.collection("Users")
            .where("username", "==", "Admin")
            .get();
        if (adminUser.docs.length === 0) {
            return res.status(400).send('User not found.');
        }
        let user = adminUser.docs[0].data();
        let result = await db.doc(`Users/${user.id}`).collection("items")
            .orderBy("timestamp", "desc")
            .limit(20)
            .get();
        let urls: string[] = [];
        for (let item of result.docs) {
            urls.push(bucket.file(`${item.id}.png`).publicUrl());
        }
        return res.status(200).send({ thumbnails: urls });
    } catch (err) {
        console.log(err);
        return res.status(400).send('Error occured: ' + err);
    };
});


app.get('/createindex', async (req, res) => {
    let user = req.user as User;
    if (user === undefined || req.isUnauthenticated()) {
        return res.status(401).send("Unautorised");
    }
    // make sure we have enough item
    let doc = db.doc(`Users/${user.id}`);
    let count = (await doc
        .collection("items")
        .count()
        .get())
        .data()
        .count;
    
    if (count < ITEM_TO_BUILD_INDEX) {
        return res.status(400).send("Il n'y a pas assez d'item ajouter.  ajouter plus d'item avant de creer l'index.");
    }
    let [indexOp, endPointOp] = await indexHandler.startIndexCreation();

    await doc.update({
        createIndexOperation: indexOp,
        createEndPointOpreation: endPointOp
    })

    return res.send({status: "Index en cours de creation."})
    
})


app.get('/undeployindex', async (req, res) => {
    let user = req.user as User;
    if (user === undefined || req.isUnauthenticated()) {
        return res.status(401).send("Unautorised");
    }
    let result = await indexHandler.undeployIndex();
    if (result !== null) {
        // this is the name of the operation
        let doc = db.doc(`Users/${user.id}`);
        await doc.update( {
            undeployOperation: result
        });
        return res.send();
    }
    return res.status(400).send("L'index est deja annule ou est en cours de deploiement.  Veuillez reessayer plus tard.");
})

app.get('/deployindex', async (req, res) => {
    let user = req.user as User;
    if (user === undefined || req.isUnauthenticated()) {
        return res.status(401).send("Unautorised");
    }
    let result = await indexHandler.deployIndex();
    if (result !== null) {
        // this is the name of the operation
        let doc = db.doc(`Users/${user.id}`);
        await doc.update( {
            deployOperation: result
        });
        return res.send();
    }

   return res.status(400).send("L'index est deja deploye ou est en cours d'annulation.  Veuillez reessayer plus tard.");
})


indexHandler
    .startVectorizer()
    .then(() => {
        const port = parseInt(process.env.PORT || "0") || 8080;
        app.listen(port, () => {
            console.log(`Listening on port ${port}`);
        });
    });
