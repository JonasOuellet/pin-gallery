import bodyParser from 'body-parser';
import express from "express";
import expressWinston from 'express-winston';
import * as multer from 'multer';
import passport from 'passport';
import { Strategy } from 'passport-local';
import session from 'express-session';
import winston from 'winston';
import * as crypto from "crypto";

import { Storage } from "@google-cloud/storage";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { FirestoreStore } from '@google-cloud/connect-firestore';

import { unlink } from 'fs';

import { IndexHandler } from './ai_index';

export const app: express.Express = express();

app.set("view engine", "ejs");

// Disable browser-side caching for demo purposes.
app.disable('etag');

app.set("views", "./views");

// Set up static routes for hosted libraries.
app.use(express.static("./static"));

const ITEM_TO_BUILD_INDEX = 10;
const projectID = process.env.PROJECT_ID;

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

const multerStorage = multer.diskStorage({
    destination: (req: express.Request, file: Express.Multer.File, cb) => {
        cb(null, "./")
    },
    filename: (req: express.Request, file: Express.Multer.File, cb) => {
        let splitted = file.mimetype.split('/');
        if (splitted[0] === "image") {
            const imageUUID = crypto.randomUUID();
            // let ext = splitted[1];
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

// Middleware that adds the user of this session as a local variable,
// so it can be displayed on all pages when logged in.
app.use((req: any, res: express.Response, next) => {
    res.locals.loggedIn = req.user && req.isAuthenticated();
    next();
});

app.get('/', (req: express.Request, res: express.Response) => {
    res.render('pages/index');
});


app.get('/login', (req: express.Request, res: express.Response) => {
    res.render('pages/login');
})

app.get('/newitem', async (req: express.Request, res: express.Response) => {
    let user = req.user as User;
    if (user === undefined) {
        res.redirect('/');
    }

    if (indexHandler._isCreatingIndex) {
        res.render('pages/newiteminvalid');
    } else {
        let indexExists = await indexHandler.indexExists();
        res.locals.indexExists = indexExists;
        if (!indexExists) {
            // check how many image we have yet
            let count = (await db.doc(`Users/${user.id}`)
                .collection("items")
                .count()
                .get()
            ).data().count;
            res.locals.itemCount = count;
            res.locals.itemCountNeeded = ITEM_TO_BUILD_INDEX;         
        }

        res.render('pages/newitem');
    }
})


app.post(
    '/login',
    passport.authenticate(
        'local',
        {
            failureRedirect: '/login',
        }
    ),
    (req: express.Request, res: express.Response) => {
        res.redirect('/');
    }
);


// GET request to log out the user.
// Destroy the current session and redirect back to the log in screen.
app.get('/logout', (req: any, res: express.Response, next) => {
    req.logout((err: any) => {
        if (err) { return next(err); }
        req.session.destroy();
        res.redirect('/');
    });
});

app.post('/item/create', upload.single('image'), async (req: express.Request, res: express.Response) => {
    let user = req.user as User;
    if (user === undefined) {
        res.redirect('/');
    }

    const img_name = req.body.image_name;
    const description = req.body.description;
    
    let file = req.file;
    if (file === undefined) {
        // TODO: handle error here
        return res.redirect('/');
    }
    if (req.body.tags) {
        const tags = (req.body.tags as string).split(';');
    } else {
        const tags: String[] = [];
    }
    let url;
    // create a new item so we can have the id
    let doc = db.doc(`Users/${user.id}`)
        .collection("items")
        .doc();
    try {
        let destination = doc.id + '.' + file.filename.split('.')[1];
        let uploadRest = await bucket.upload(file.path, {destination: destination});
        url = (uploadRest[1] as any).mediaLink;
    } catch (err) {
        console.log(err);
        unlink(file.path, () => {});
        return res.redirect('/');
    } finally {
        try { await doc.delete() } catch (err) {};
    }
    try {
        let data: DBItem = {
            name: img_name,
            description: description,
            timestamp: Timestamp.now(),
            url: url
        }
        await doc.set(data);
    } catch(err) {
        console.log("Error adding file to database");
        console.log(err);
        return res.redirect("/");
    }

    if (await indexHandler.indexExists()) {
        // update the index
        indexHandler.addDataPoint(
            file.path,
            doc.id
        ).finally(() => {
            // we need to delete the file here so we use it to update the index
            if (file) { unlink(file.path, () => {}); }
        })
    } else {
        // we need to delete the file here so we use it to update the index
        unlink(file.path, () => {});
        // check how many item count
        let count = await db.doc(`Users/${user.id}`)
            .collection("items")
            .count()
            .get();

        if (count.data().count >= 10) {
            // generate index
            indexHandler.startIndexCreation();
        }
    }

    res.redirect("/");
});


app.post('/item/similarimage', upload.single('image'), async (req: express.Request, res: express.Response) => {
    let user = req.user as User;
    if (user === undefined) {
        return res.status(400).send("Invalid user.");
    }
    
    let file = req.file;
    if (file === undefined) {
        // TODO: handle error here
        return res.status(400).send("File not defined.");
    }

    try {
        let result = await indexHandler.find_similar_local(file.path)
        let urls: {url: string, distance: number}[] = [];
        let collection = db.doc(`Users/${user.id}`).collection("items");
        for (let r of result) {
            let doc = await collection.doc(r.id).get();
            urls.push({
                url: (doc.data() as any).url,
                distance: r.distance
            });
        }
        res.send({
            results: urls
        });

    } catch (err) {
        res.status(400).send("Error occured");
    }
    finally {
        unlink(file.path, () => {});
    }

});


app.get('/items/read', async (req: express.Request, res: express.Response) => {
    try {
        let adminUser = await db.collection("Users")
            .where("username", "==", "Admin")
            .get();
        if (adminUser.docs.length === 0) {
            return res.status(400).send('User not found.');
        }
        let user = adminUser.docs[0].data();
        let result = await db.doc(`Users/${user.id}`).collection("items")
            .select("url")
            .orderBy("timestamp", "desc")
            // we can't go further than 50 given google docs
            .limit(50)
            .get();
        let urls: string[] = [];
        for (let user of result.docs) {
            urls.push(user.data().url);
        }
        return res.status(200).send({ thumbnails: urls });
    } catch (err) {
        console.log(err);
        return res.status(400).send('Error occured: ' + err);
    };
});


const port = parseInt(process.env.PORT || "0") || 8080;
app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});
