import bodyParser from 'body-parser';
import express from "express";
import expressWinston from 'express-winston';
import * as fetch from 'node-fetch';
import * as multer from 'multer';
import passport from 'passport';
import session from 'express-session';
import winston from 'winston';
import * as crypto from "crypto";

import { Firestore, Query, Timestamp } from "@google-cloud/firestore";
import { FirestoreStore } from '@google-cloud/connect-firestore';

import { auth } from './auth.js';
import { config } from './config.js';


export const app: express.Express = express();

app.set("view engine", "ejs");

// Disable browser-side caching for demo purposes.
app.disable('etag');

app.set("views", "./views");

// Set up static routes for hosted libraries.
app.use(express.static("./static"));

// setup firestore
// https://cloud.google.com/firestore/docs/emulator?hl=fr
// TODO: fill settings
const db = new Firestore();
app.use(
    session({
        store: new FirestoreStore({
            dataset: db,
            kind: 'express-sessions'
        }),
        secret: config.dataBase.secret,
        resave: false,
        saveUninitialized: true
    })
);


// Set up OAuth 2.0 authentication through the passport.js library.
auth(passport);


// Console transport for winton.
const consoleTransport = new winston.transports.Console();

// Set up winston logging.
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    ),
    transports: [
        consoleTransport
    ]
});

// Enable extensive logging if the DEBUG environment variable is set.
if (process.env.DEBUG) {
    // Print all winston log levels.
    logger.level = 'silly';

    // Enable express.js debugging. This logs all received requests.
    app.use(expressWinston.logger({
        transports: [
            consoleTransport
        ],
        winstonInstance: logger
    }));

} else {
    // By default, only print all 'verbose' log level messages or below.
    logger.level = 'verbose';
}


// Set up static routes for hosted libraries.
// https://github.com/swc-project/swc/issues/1202
// const hereUrl = pathToFileURL(__dirname).toString();
// console.log(hereUrl);
// console.log(fileURLToPath(new URL('node_modules/jquery/dist/', hereUrl)));

app.use(express.static('static'));
app.use('/js', express.static("./node_modules/jquery/dist/"));
app.use('/fancybox', express.static('./node_modules/@fancyapps/fancybox/dist/'));
app.use('/mdlite', express.static('./node_modules/material-design-lite/dist/'));

// const multerStorage = multer.diskStorage({
//     destination: (req: express.Request, file: Express.Multer.File, cb) => {
//         cb(null, "./uploads/")
//     },
//     filename: (req: express.Request, file: Express.Multer.File, cb) => {
//         let splitted = file.mimetype.split('/');
//         if (splitted[0] === "image") {
//             // let ext = splitted[1];
//             cb(null, file.originalname);
//         }
//         else {
//             cb(new Error(`Invalid mime type: (${splitted[0]})`), "");
//         }
//     }
// });
const multerMemoryStorage = multer.memoryStorage();
const upload = multer.default({storage: multerMemoryStorage});

// Parse application/json request data.
app.use(bodyParser.json());

// Parse application/xwww-form-urlencoded request data.
app.use(bodyParser.urlencoded({ extended: true }));

// Set up passport and session handling.
app.use(passport.initialize());
app.use(passport.session());

// Middleware that adds the user of this session as a local variable,
// so it can be displayed on all pages when logged in.
app.use((req: any, res: express.Response, next) => {
    res.locals.name = '-';
    if (req.user && req.user.profile && req.user.profile.name) {
        res.locals.name =
            req.user.profile.name.givenName || req.user.profile.displayName;
    }

    res.locals.avatarUrl = '';
    if (req.user && req.user.profile && req.user.profile.photos) {
        res.locals.avatarUrl = req.user.profile.photos[0].value;
    }

    res.locals.loggedIn = req.user && req.isAuthenticated();
    next();
});

async function getUser(req: express.Request, res: express.Response) : Promise<DBUser | null> {
    try {
        let users = await db.collection("Users")
            .where("profile_id", "==", (req.user as any).profile.id)
            .limit(1)
            .get();
        if (users.docs.length === 1) {
            let doc = users.docs[0];
            return {
                id: doc.id,
                ...(doc.data() as DBUserCreate)
            };
        }
    } catch (err) {
        console.log(`Get user error: ${err}`);
    }
    return null;
}

async function getCollections(user: DBUser) : Promise<DBCollection[]> {
    try {
        let collections = await db.doc(`Users/${user.id}`).collection("Collections").get();
        let out: DBCollection[] = [];
        for (let col of collections.docs) {
            out.push({
                id: col.id,
                ...(col.data() as DBCollectionCreate)
            })
        }
        return out;
    } catch (err) {
        console.log(`Get Collections error: ${err}`)
    }
    return [];
}

async function getCollectionFromName(user: DBUser, collectionName: string) : Promise<DBCollection | null> {
    try {
        let collections = await db.doc(`Users/${user.id}`).collection("Collections")
            .where("name", "==", collectionName)
            .limit(1)
            .get();
        if (collections.docs.length === 1) {
            let doc = collections.docs[0];
            return {
                id: doc.id,
                ...(doc.data() as DBCollectionCreate)
            };
        }
    } catch (err) {
        console.log(`Get collections error: ${err}`);
    }
    return null;
}


async function getCollectionDocFromName(user: DBUser, collectionName: string)
: Promise<FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData> | null> {
    try {
        let collections = await db.doc(`Users/${user.id}`).collection("Collections")
            .where("name", "==", collectionName)
            .limit(1)
            .get();
        if (collections.docs.length === 1) {
            let doc = collections.docs[0];
            return doc;
        }
    } catch (err) {
        console.log(`Get collections error: ${err}`);
    }
    return null;
}

async function getCollectionImage(authToken: string, col: DBCollection, pageSize: number): Promise<MediaItemSearchResult> {
    // https://developers.google.com/photos/library/reference/rest/v1/mediaItems/search?hl=fr
    try {
        let result = await fetch.default(
            config.apiEndpoint + '/v1/mediaItems:search',
            {
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({
                    albumId: col.google_id,
                    pageSize: pageSize
                    // page token
                })
            }
        );
        if (result.status === 200) {
            let body: MediaItemSearchResult = await result.json();
            // body might be empty:
            if (typeof(body.mediaItems) !== "undefined") {
                return body;
            }
        } else {
            console.log(`Request error: ${result.status}, ${result.statusText}`);
        }
    } catch (err) {
        console.log(`Error: ${err}`);
    }
    return {
        mediaItems: [],
        nextPageToken: ""
    }
}


async function getCollection(id: string, user: DBUser): Promise<DBCollection | null> {
    try {
        let doc = await db.doc(`Users/${user.id}`).collection("Collections").doc(id).get();
        return {
            id: doc.id,
            ...(doc.data() as DBCollectionCreate)
        };
    } catch (err) {
        console.log(`Get collections error: ${err}`);
    }
    return null;
}


function findCollectionByName(collections: DBCollection[], name: string) : DBCollection {
    for (var coll of collections) {
        if (coll.name === name) {
            return coll;
        }
    }
    throw new Error("Couldn't find collections with name: " + name);
}


function getCollectionTabs(collections: DBCollection[], currentCollections?: string, addCreate?: boolean, createCurrent?: boolean):  UICollectionTabs[] {
    let out: UICollectionTabs[] = [];
    if (collections.length > 1) {
        out.push({
            ref: "/collections",
            name: "Toutes mes collections",
            selected: currentCollections === undefined && createCurrent !== true
        });
        out.push({
            ref: "",
            name: "separator",
            selected: false
        });
    }
    collections.forEach((album, index) => {
        out.push({
            ref: `/collections/${album.name}`,
            name: album.name,
            selected: album.name === currentCollections
        })
    })
    if (addCreate) {
        if (out.length > 2) {
            out.push({
                ref: "",
                name: "separator",
                selected: false
            });
        }
        out.push({
            ref: "/collections/add",
            name: "Ajouter une collection",
            selected: createCurrent === true
        })
    }
    return out;
}

// GET request to the root.
// Display the login screen if the user is not logged in yet, otherwise the
// photo frame.
app.get('/', (req: express.Request, res: express.Response) => {
    res.render('pages/index');
});


// GET request to log out the user.
// Destroy the current session and redirect back to the log in screen.
app.get('/logout', (req: any, res: express.Response, next) => {
    req.logout((err: any) => {
        if (err) { return next(err); }
        req.session.destroy();
        res.redirect('/');
    });
});


// Star the OAuth login process for Google.
app.get('/auth/google', passport.authenticate('google', {
    scope: config.scopes,
    failureFlash: true,  // Display errors to the user.
    session: true,
}));


// Callback receiver for the OAuth process after log in.
app.get(
    '/auth/google/callback',
    passport.authenticate(
        'google', { failureRedirect: '/', failureFlash: true, session: true }),
    async(req, res) => {
        // add user to database
        let profile_id = (req as any).user.profile.id;
        let name = (req as any).user.profile.displayName;
        try {
            let users = await db.collection("Users")
                .select("name")
                .where("profile_id", "==", profile_id)
                .get();
                if (users.empty) {
                    // add a new user
                    // set the first user that logging to be the "admin"
                    let count = (await db.collection("Users").count().get()).data().count
                    let ref = db.collection("Users").doc();
                    await ref.set({
                        name: name,
                        profile_id: profile_id,
                        cancreate: count === 0
                } as DBUserCreate)
            }
        } catch (err) {
            console.log("Error: " + err);
            res.redirect('/');
        }
        req.session.save(() => {
            res.redirect('/');
    });
});


app.get('/collections/:colname/itemimages/read', async (req: express.Request, res: express.Response) => {
    try {
        if (isAuthenticated(req)) {
            let dbuser = await getUser(req, res);
            if (dbuser === null) {
                return res.status(400).send('User not found.');
            }
            let collDoc = await getCollectionDocFromName(dbuser, req.params.colname);
            if (collDoc === null) {
                return res.status(400).send('Collection not found.');
            }
    
            let imgs = await collDoc.ref.collection("Items")
                .orderBy("timestamp", "desc")
                // we can't go further than 50 given google docs
                .limit(50)
                .get();
            let urls: (String | null)[] = [];
            let toFetch: {
                doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData, FirebaseFirestore.DocumentData>,
                google_id: string,
                index: number 
            }[] = [];
            let now = Timestamp.now();
            // user a buffer of 5 min here. just to be sure the link is still valid
            const HOUR = 55 * 60;
            imgs.docs.forEach((item, index) => {
                let data = item.data() as DBItem;
                // check if already fetched and if the last fetch occured in less than a hour ago  (use 55 min in this case)
                if (typeof(data.base_url_fetch) === 'undefined' || (now.seconds - data.base_url_fetch.seconds) > HOUR) {
                    // need to fetch again
                    urls.push(null);
                    toFetch.push({
                        doc: item,
                        google_id: data.google_id,
                        index: index
                    });
                } else {
                    urls.push(data.base_url as any);
                }
            });

            if (toFetch.length > 0) {
                // fetch the image that need to be fetched
                const authToken: string = (req as any).user.token;
                let parameters = new URLSearchParams();
                for (let id of toFetch){
                    parameters.append('mediaItemIds', id.google_id);
                }
                let result = await fetch.default(
                    config.apiEndpoint + '/v1/mediaItems:batchGet?' + parameters,
                    {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + authToken
                        }
                    },
                );
                if (result.status !== 200) {
                    throw new Error(`Error: Status Code: ${result.status}.  ${result.statusText}`)
                }
                let body = await result.json();
                body.mediaItemResults.forEach((ret: any, index: number) => {
                    if (typeof(ret.code) === 'undefined') {
                        let f = toFetch[index];
                        urls[f.index] = ret.mediaItem.baseUrl;
                        // update db
                        f.doc.ref.update({
                            base_url_fetch: now,
                            base_url: ret.mediaItem.baseUrl
                        })
                    }
                })
            }
            urls = urls.filter((v) => v !== null);
            return res.status(200).send({ thumbnails: urls });

        } else {
            return res.status(401).send('Unhautorized');
        }
    } catch (err) {
        console.log(err);
        return res.status(400).send('Error occured: ' + err);
    };
});


app.get('/collections', async (req: express.Request, res: express.Response) => {
    if (isAuthenticated(req)) {
        // check if user can add collection.
        let dbuser = await getUser(req, res);
        if (dbuser === null) {
            res.redirect('/');
        } else if (dbuser.cancreate) {
            // find collections
            let collections = await getCollections(dbuser);
            if (collections.length === 0) {
                // if no albums redirect to add
                res.redirect('/collections/add');
            }
            else if (collections.length === 1) {
                // if only one redirect to the main page of this ablum
                res.redirect(`/collections/${collections[0].name}`);
            } else {
                res.render('pages/collections', {
                    headerTabs: getCollectionTabs(collections, undefined, true, false),
                    collections: collections
                }); 
            }
        } else {
            res.render('pages/collectionsNoAcces');
        }
    } else {
        res.redirect('/');
    }
});

app.get("/collections/add", async (req: express.Request, res: express.Response) => {
    if (isAuthenticated(req)) {
        // check if user can add collection.
        let dbuser = await getUser(req, res);
        if (dbuser === null) {
            res.redirect('/');
        } else if (dbuser.cancreate) {
            // find collections
            let collections = await getCollections(dbuser);
            res.render('pages/collectionsnew', {
                headerTabs: getCollectionTabs(collections, undefined, true, true)
            });
        } else {
            res.render('pages/collectionsNoAcces');
        }
    } else {
        res.redirect('/');
    }
});

app.get("/collections/:colname", async (req: express.Request, res: express.Response) => {
    if (isAuthenticated(req)) {
        // check if user can add collection.
        let dbuser = await getUser(req, res);
        if (dbuser === null) {
            res.redirect('/');
        } else {
            let collections = await getCollections(dbuser);
            let collection = findCollectionByName(collections, req.params.colname);
            res.render(
                "pages/collection",
                {
                    headerTabs: getCollectionTabs(collections, req.params.colname, true, false),
                    collectionName: req.params.colname,
                    collectionDescription: collection.description
                }
            )
        }
    } else {
        res.redirect('/');
    }
});


app.get("/collections/:colname/newitem", async (req: express.Request, res: express.Response) => {
    if (isAuthenticated(req)) {
        // check if user can add collection.
        let dbuser = await getUser(req, res);
        if (dbuser === null) {
            res.redirect('/');
        } else {
            let collections = await getCollections(dbuser);
            let collection = findCollectionByName(collections, req.params.colname);
            res.render(
                "pages/collectionNewItem",
                {
                    headerTabs: getCollectionTabs(collections, req.params.colname, true, false),
                    collectionName: req.params.colname,
                    collectionDescription: collection.description,
                    collectionID: collection.id
                }
            )
        }
    } else {
        res.redirect('/');
    }
});


app.post('/collections/create', async (req: express.Request, res: express.Response) => {
    try { 
        const authToken: string = (req as any).user.token;
        const name = req.body.name;
        const description = req.body.description;
        const ispublic = (req.body.ispublic == 'on');
        
        let result = await fetch.default(
            config.apiEndpoint + '/v1/albums',
            {
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({
                    album: {
                        title: name + "_Collectionneur"
                    }
                })
            }
        )
        if (result !== undefined && result.status == 200) {
            let body = await result.json();
            let user = await getUser(req, res);
            if (user === null) {
                throw new Error("Couldn't find current user.");
            }
            let doc = db.doc(`Users/${user.id}`).collection("Collections").doc();
            let data: DBCollectionCreate = {
                name: name,
                google_id: body.id,
                description: description,
                public: ispublic 
            }
            await doc.set(data);
            res.redirect(`/collections/${name}`)
        } else {
            throw new Error(`Invalid status code: ${result.status}.  "${result.statusText}`);
        }
    } catch (err) {
        console.log("Error creating a new collect: ", err);
        res.redirect("/collections")
    }
});

app.post('/collection/:collectionID/items/create', upload.single('image'), async (req: express.Request, res: express.Response, next) => {
    const authToken: string = (req as any).user.token;
    let file = req.file;
    if (file === undefined) {
        // TODO: handle error here
        return;
    }
    let user = await getUser(req, res);
    if (user === null) {
        return Promise.reject(new Error("Invalid user."));
    }
    let collection = await getCollection(req.params.collectionID, user);
    if (collection === null) {
        return Promise.reject(new Error(`Invalid collection Id for ${req.params.collectionID}`)); 
    }
    const img_name = req.body.image_name;
    const description = req.body.description;
    const imageUUID = crypto.randomUUID();
    if (req.body.tags) {
        const tags = (req.body.tags as string).split(';');
    } else {
        const tags: String[] = [];
    }
    fetch.default(
        config.apiEndpoint + '/v1/uploads',
        {
            method: 'post',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Authorization': 'Bearer ' + authToken,
                'X-Goog-Upload-Content-Type': file.mimetype,
                'X-Goog-Upload-Protocol': 'raw'
            },
            body: file.buffer
        }
    ).then(async (res: fetch.Response) => {
        if (res.status === 200) {
            return res.text();
        }
        return Promise.reject(new Error(`Error uploading image.  Status code: ${res.status}:  ${res.statusText}`));
    }).then(async (uploadtoken: string) => {
        return fetch.default(
                config.apiEndpoint + '/v1/mediaItems:batchCreate',
                {
                    method: 'post',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken,
                    },
                    body: JSON.stringify({
                        albumId: (collection as any).google_id,
                        newMediaItems: [
                            {  
                                simpleMediaItem: {
                                    fileName: `${imageUUID}.png`,
                                    uploadToken: uploadtoken
                                }
                            }
                        ]
                    })
                }
        );
    }).then(async (fetchRes: fetch.Response) => {
        if (fetchRes.status !== 200) {
            return Promise.reject(new Error(`Error creating new media.  Status code: ${fetchRes.status}, ${fetchRes.statusText}`));
        }
        let mediaResults: NewMediaItemResults = await fetchRes.json();
        // TODO: handle the tags.
        for (let newItem of mediaResults.newMediaItemResults) {
            console.log(`${newItem.mediaItem.filename} successfully uploaded.`);
            try {
                let doc = db.doc(`Users/${(user as any).id}`)
                    .collection("Collections")
                    .doc((collection as any).id)
                    .collection("Items")
                    .doc();
                
                let data: DBItemCreate = {
                    name: img_name,
                    description: description,
                    google_id: newItem.mediaItem.id,
                    timestamp: Timestamp.now()
                }
                await doc.set(data);
            } catch(err) {
                console.log("Error adding file to database");
                console.log(err);
            }
        }
        res.redirect(`/collections/${(collection as any).name}`);
    }).catch((err: any) => {
        // TODO: handle error here:
        console.log("Error occured", err);
        res.redirect(`/collections/${(collection as any).name}`);
    });
    
});


function isAuthenticated(req: express.Request) : boolean {
    return req.user !== undefined && req.isAuthenticated();
}


// Renders the given page if the user is authenticated.
// Otherwise, redirects to "/".
function renderIfAuthenticated(req: express.Request, res: express.Response, page: string) {
    if (isAuthenticated(req)) {
        res.render(page);
    } else {
        res.redirect('/');
    }
}

const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
