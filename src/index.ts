import bodyParser from 'body-parser';
import express from "express";
import expressWinston from 'express-winston';
import * as fetch from 'node-fetch';
import * as multer from 'multer';
import passport from 'passport';
import persist from 'node-persist';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import winston from 'winston';
import * as pgp from "pg-promise";

import { auth } from './auth.js';
import { config } from './config.js';


const database = pgp.default()(config.dataBase);

const app: express.Express = express();
const fileStore = sessionFileStore(session);

app.set("view engine", "ejs");

// Disable browser-side caching for demo purposes.
app.disable('etag');

app.set("views", "./views");

// Set up static routes for hosted libraries.
app.use(express.static("./static"));


// Set up a cache for media items that expires after 55 minutes.
// This caches the baseUrls for media items that have been selected
// by the user for the photo frame. They are used to display photos in
// thumbnails and in the frame. The baseUrls are send to the frontend and
// displayed from there. The baseUrls are cached temporarily to ensure that the
// app is responsive and quick. Note that this data should only be stored for a
// short amount of time and that access to the URLs expires after 60 minutes.
// See the 'best practices' and 'acceptable use policy' in the developer
// documentation.
const mediaItemCache = persist.create({
    dir: 'persist-mediaitemcache/',
    ttl: 3300000,  // 55 minutes
});
mediaItemCache.init();


// Temporarily cache a list of the albums owned by the user. This caches
// the name and base Url of the cover image. This ensures that the app
// is responsive when the user picks an album.
// Loading a full list of the albums owned by the user may take multiple
// requests. Caching this temporarily allows the user to go back to the
// album selection screen without having to wait for the requests to
// complete every time.
// Note that this data is only cached temporarily as per the 'best practices' in
// the developer documentation. Here it expires after 10 minutes.
const albumCache = persist.create({
    dir: 'persist-albumcache/',
    ttl: 600000,  // 10 minutes
});
albumCache.init();

// For each user, the app stores the last search parameters or album
// they loaded into the photo frame. The next time they log in
// (or when the cached data expires), this search is resubmitted.
// This keeps the data fresh. Instead of storing the search parameters,
// we could also store a list of the media item ids and refresh them,
// but resubmitting the search query ensures that the photo frame displays
// any new images that match the search criteria (or that have been added
// to an album).
const storage = persist.create({ dir: 'persist-storage/' });
storage.init();


// Set up OAuth 2.0 authentication through the passport.js library.
auth(passport);

// Set up a session middleware to handle user sessions.
// NOTE: A secret is used to sign the cookie. This is just used for this sample
// app and should be changed.
const sessionMiddleware = session({
    resave: true,
    saveUninitialized: true,
    store: new fileStore({}),
    secret: 'photo frame sample',
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

// Enable user session handling.
app.use(sessionMiddleware);

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
    let queryRes = await database.manyOrNone(`SELECT * FROM users WHERE profile_id='${(req as any).user.profile.id}';`)
    .catch((err) => {
        return null;
    });
    if (queryRes?.length === 1) {
        let item = queryRes[0];
        return item;
    }
    return null;
}

async function getCollections(user: DBUser) : Promise<DBCollection[]> {
    let queryRes = await database.manyOrNone(`SELECT * FROM collections WHERE user_id='${user.id}';`)
        .catch((err) => {
            return [];
        });
    return queryRes;
}

async function getCollectionGoogleID(id: string) : Promise<string | null> {
    let queryRes = await database.oneOrNone(`SELECT google_id FROM collections WHERE id='${id}';`)
        .catch((err) => {
            return {google_id: null};
        });
    return queryRes.google_id;
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
    collections.forEach((album, index) => {
        out.push({
            ref: `/collections/${album.name}`,
            name: album.name,
            selected: album.name === currentCollections
        })
    })
    if (addCreate) {
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
        await database.none(
        `INSERT INTO users (name, profile_id)
        SELECT '${name}', '${profile_id}'
        WHERE
        NOT EXISTS (
            SELECT name, profile_id FROM users WHERE profile_id='${profile_id}'
        );
        `).catch((err) => {
            console.log("Couldn't add user to table.")
            console.log(err);
        });
        req.session.save(() => {
            res.redirect('/');
    });
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
                    headerTabs: getCollectionTabs(collections, undefined, true, false)
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


app.post('/newcollection', async (req: express.Request, res: express.Response) => {
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
    .catch((err) => {
        console.log(err);
        return undefined;
    });
    if (result !== undefined && result.status == 200) {
        let body = await result.json();
        // add it to the data base
        let pub = ispublic ? "TRUE": "FALSE";
        let user = await getUser(req, res);
        if (user === null) {
            console.log("Couldn't find current user.")
            return;
        }
        await database.none(`INSERT INTO collections 
            (name, google_id, description, public, user_id)
            VALUES
            ('${name}', '${body.id}', '${description}', ${pub}, '${user.id}');`);

        // TODO: if set to public update the google api

        // Server side event to the page to tell the user that the album as been added.
    } else {
        console.log("error creating the album");
        console.log(result?.status);
        console.log(result?.statusText);
    }
});

app.post('/collection/:collectionID/newitem', upload.single('image'), async (req: express.Request, res: express.Response, next) => {
    const authToken: string = (req as any).user.token;
    let file = req.file;
    if (file === undefined) {
        // TODO: handle error here
        return;
    }
    const img_name = req.body.image_name;
    const description = req.body.description;
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
        let albumId = await getCollectionGoogleID(req.params.collectionID);
        if (albumId === null) {
            return Promise.reject(new Error(`Error getting google id for ${req.params.collectionID}`));
        }
        return fetch.default(
                config.apiEndpoint + '/v1/mediaItems:batchCreate',
                {
                    method: 'post',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken,
                    },
                    body: JSON.stringify({
                        albumId: albumId,
                        newMediaItems: [
                            {  
                                simpleMediaItem: {
                                    fileName: "temp.png",
                                    uploadToken: uploadtoken
                                }
                            }
                        ]
                    })
                }
        );
    }).then(async (res: fetch.Response) => {
        if (res.status !== 200) {
            return Promise.reject(new Error(`Error creating new media.  Status code: ${res.status}, ${res.statusText}`));
        }
        let mediaResults: NewMediaItemResults = await res.json();
        mediaResults.newMediaItemResults.forEach(async (newItem) => {
            console.log(`${newItem.mediaItem.filename} successfully uploaded.`);
            // console.log(newItem.mediaItem.id);
            // seems like the media item id is 98
            // console.log(newItem.mediaItem.id.length);
            // add it to the db
            // await db.none(`INSERT INTO pins VALUES(${newIndex}, '${newItem.mediaItem.id}');`);
        })
    }).catch((err: any) => {
        // TODO: handle error here:
        console.log("Error occured", err);
    });
});


// Loads the search page if the user is authenticated.
// This page includes the search form.
app.get('/search', (req, res) => {
    renderIfAuthenticated(req, res, 'pages/search');
});

// Loads the album page if the user is authenticated.
// This page displays a list of albums owned by the user.
app.get('/album', (req, res) => {
    renderIfAuthenticated(req, res, 'pages/album');
});

// Handles form submissions from the search page.
// The user has made a selection and wants to load photos into the photo frame
// from a search query.
// Construct a filter and submit it to the Library API in
// libraryApiSearch(authToken, parameters).
// Returns a list of media items if the search was successful, or an error
// otherwise.
app.post('/loadFromSearch', async (req: any, res: any) => {
    const authToken = req.user.token;

    logger.info('Loading images from search.');
    logger.silly('Received form data: ', req.body);

    // Construct a filter for photos.
    // Other parameters are added below based on the form submission.
    const filters: SearchFilter = { 
        contentFilter: {}, 
        mediaTypeFilter: { 
            mediaTypes: ['PHOTO'] 
        } 
    };

    if (req.body.includedCategories) {
        // Included categories are set in the form. Add them to the filter.
        filters.contentFilter.includedContentCategories =
            [req.body.includedCategories];
    }

    if (req.body.excludedCategories) {
        // Excluded categories are set in the form. Add them to the filter.
        filters.contentFilter.excludedContentCategories =
            [req.body.excludedCategories];
    }

    // Add a date filter if set, either as exact or as range.
    if (req.body.dateFilter == 'exact') {
        filters.dateFilter = {
            dates: constructDate(
                req.body.exactYear, req.body.exactMonth, req.body.exactDay),
        }
    } else if (req.body.dateFilter == 'range') {
        filters.dateFilter = {
            ranges: [{
                startDate: constructDate(
                    req.body.startYear, req.body.startMonth, req.body.startDay),
                endDate:
                    constructDate(req.body.endYear, req.body.endMonth, req.body.endDay),
            }]
        }
    }

    // Create the parameters that will be submitted to the Library API.
    const parameters: SearchParameters = { filters };

    // Submit the search request to the API and wait for the result.
    const data = await libraryApiSearch(authToken, parameters);

    // Return and cache the result and parameters.
    const userId = req.user.profile.id;
    returnPhotos(res, userId, data, parameters);
});


// Handles selections from the album page where an album ID is submitted.
// The user has selected an album and wants to load photos from an album
// into the photo frame.
// Submits a search for all media items in an album to the Library API.
// Returns a list of photos if this was successful, or an error otherwise.
app.post('/loadFromAlbum', async (req: any, res: any) => {
    const albumId = req.body.albumId;
    const userId = req.user.profile.id;
    const authToken = req.user.token;

    logger.info(`Importing album: ${albumId}`);

    // To list all media in an album, construct a search request
    // where the only parameter is the album ID.
    // Note that no other filters can be set, so this search will
    // also return videos that are otherwise filtered out in libraryApiSearch(..).
    const parameters = { albumId };

    // Submit the search request to the API and wait for the result.
    const data = await libraryApiSearch(authToken, parameters);

    returnPhotos(res, userId, data, parameters)
});


// Returns all albums owned by the user.
app.get('/getAlbums', async (req: any, res: any) => {
    logger.info('Loading albums');
    const userId = req.user.profile.id;

    // Attempt to load the albums from cache if available.
    // Temporarily caching the albums makes the app more responsive.
    const cachedAlbums = await albumCache.getItem(userId);
    if (cachedAlbums) {
        logger.verbose('Loaded albums from cache.');
        res.status(200).send(cachedAlbums);
    } else {
        logger.verbose('Loading albums from API.');
        // Albums not in cache, retrieve the albums from the Library API
        // and return them
        const data = await libraryApiGetAlbums(req.user.token);
        if (data.error) {
            // Error occured during the request. Albums could not be loaded.
            returnError(res, data);
            // Clear the cached albums.
            albumCache.removeItem(userId);
        } else {
            // Albums were successfully loaded from the API. Cache them
            // temporarily to speed up the next request and return them.
            // The cache implementation automatically clears the data when the TTL is
            // reached.
            res.status(200).send(data);
            albumCache.setItem(userId, data);
        }
    }
});


// Returns a list of the media items that the user has selected to
// be shown on the photo frame.
// If the media items are still in the temporary cache, they are directly
// returned, otherwise the search parameters that were used to load the photos
// are resubmitted to the API and the result returned.
app.get('/getQueue', async (req: any, res: any) => {
    const userId = req.user.profile.id;
    const authToken = req.user.token;

    logger.info('Loading queue.');

    // Attempt to load the queue from cache first. This contains full mediaItems
    // that include URLs. Note that these expire after 1 hour. The TTL on this
    // cache has been set to this limit and it is cleared automatically when this
    // time limit is reached. Caching this data makes the app more responsive,
    // as it can be returned directly from memory whenever the user navigates
    // back to the photo frame.
    const cachedPhotos = await mediaItemCache.getItem(userId);
    const stored = await storage.getItem(userId);

    if (cachedPhotos) {
        // Items are still cached. Return them.
        logger.verbose('Returning cached photos.');
        res.status(200).send({ photos: cachedPhotos, parameters: stored.parameters });
    } else if (stored && stored.parameters) {
        // Items are no longer cached. Resubmit the stored search query and return
        // the result.
        logger.verbose(
            `Resubmitting filter search ${JSON.stringify(stored.parameters)}`);
        const data = await libraryApiSearch(authToken, stored.parameters);
        returnPhotos(res, userId, data, stored.parameters);
    } else {
        // No data is stored yet for the user. Return an empty response.
        // The user is likely new.
        logger.verbose('No cached data.')
        res.status(200).send({});
    }
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


// If the supplied result is succesful, the parameters and media items are
// cached.
// Helper method that returns and caches the result from a Library API search
// query returned by libraryApiSearch(...). If the data.error field is set,
// the data is handled as an error and not cached. See returnError instead.
// Otherwise, the media items are cached, the search parameters are stored
// and they are returned in the response.
function returnPhotos(res: express.Response, userId: string, data: LibraryGetPhotos, searchParameter: SearchParameters) {
    if (data.error) {
        returnError(res, data)
    } else {
        // Remove the pageToken and pageSize from the search parameters.
        // They will be set again when the request is submitted but don't need to be
        // stored.
        delete searchParameter.pageToken;
        delete searchParameter.pageSize;

        // Cache the media items that were loaded temporarily.
        mediaItemCache.setItem(userId, data.photos);
        // Store the parameters that were used to load these images. They are used
        // to resubmit the query after the cache expires.
        storage.setItem(userId, { parameters: searchParameter });

        // Return the photos and parameters back int the response.
        res.status(200).send({ photos: data.photos, parameters: searchParameter });
    }
}

// Responds with an error status code and the encapsulated data.error.
function returnError(res: express.Response, data: LibraryGet) {
    // Return the same status code that was returned in the error or use 500
    // otherwise.
    if (data.error === null) {
        return;
    }
    const statusCode = data.error.status || 500;
    // Return the error.
    res.status(statusCode).send(JSON.stringify(data.error));
}

// Constructs a date object required for the Library API.
// Undefined parameters are not set in the date object, which the API sees as a
// wildcard.
function constructDate(
    year: string | null,
    month: string | null,
    day: string | null
) : PGDate {
    const date: PGDate = {
        year: "",
        month: "",
        day: "",
    };
    if (year) date.year = year;
    if (month) date.month = month;
    if (day) date.day = day;
    return date;
}

// Submits a search request to the Google Photos Library API for the given
// parameters. The authToken is used to authenticate requests for the API.
// The minimum number of expected results is configured in config.photosToLoad.
// This function makes multiple calls to the API to load at least as many photos
// as requested. This may result in more items being listed in the response than
// originally requested.
async function libraryApiSearch(authToken: string, parameters: any) : Promise<LibraryGetPhotos> {
    let photos: any[] = [];
    let nextPageToken = null;
    let error = null;

    parameters.pageSize = config.searchPageSize;

    try {
        // Loop while the number of photos threshold has not been met yet
        // and while there is a nextPageToken to load more items.
        do {
            logger.info(
                `Submitting search with parameters: ${JSON.stringify(parameters)}`);

            // Make a POST request to search the library or album
            const searchResponse =
                await fetch.default(config.apiEndpoint + '/v1/mediaItems:search', {
                    method: 'post',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify(parameters)
                });

            const result = await checkStatus(searchResponse);

            logger.debug(`Response: ${result}`);

            // The list of media items returned may be sparse and contain missing
            // elements. Remove all invalid elements.
            // Also remove all elements that are not images by checking its mime type.
            // Media type filters can't be applied if an album is loaded, so an extra
            // filter step is required here to ensure that only images are returned.
            const items = result && result.mediaItems ?
                result.mediaItems
                    .filter((x: any) => x)  // Filter empty or invalid items.
                    // Only keep media items with an image mime type.
                    .filter((x: any) => x.mimeType && x.mimeType.startsWith('image/')) :
                [];

            photos = photos.concat(items);

            // Set the pageToken for the next request.
            parameters.pageToken = result.nextPageToken;

            logger.verbose(
                `Found ${items.length} images in this request. Total images: ${photos.length}`);

            // Loop until the required number of photos has been loaded or until there
            // are no more photos, ie. there is no pageToken.
        } while (photos.length < config.photosToLoad &&
            parameters.pageToken != null);

    } catch (err: any) {
        // Log the error and prepare to return it.
        error = err;
        logger.error(error);
    }

    logger.info('Search complete.');
    return {
       photos: photos,
       parameters: parameters,
       error: error 
    };
}

// Returns a list of all albums owner by the logged in user from the Library
// API.
async function libraryApiGetAlbums(authToken: string) : Promise<LibraryGetAlbums> {
    let albums: string[] = [];
    let nextPageToken = null;
    let error = null;

    let parameters = new URLSearchParams();
    parameters.append('pageSize', config.albumPageSize.toString());

    try {
        // Loop while there is a nextpageToken property in the response until all
        // albums have been listed.
        do {
            logger.verbose(`Loading albums. Received so far: ${albums.length}`);
            // Make a GET request to load the albums with optional parameters (the
            // pageToken if set).
            const albumResponse = await fetch.default(config.apiEndpoint + '/v1/albums?' + parameters, {
                method: 'get',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
            });

            const result = await checkStatus(albumResponse);

            logger.debug(`Response: ${result}`);

            if (result && result.albums) {
                logger.verbose(`Number of albums received: ${result.albums.length}`);
                // Parse albums and add them to the list, skipping empty entries.
                const items = result.albums.filter( (x: any) => { return !!x } );

                albums = albums.concat(items);
            }
            if (result.nextPageToken) {
                parameters.set('pageToken', result.nextPageToken);
            } else {
                parameters.delete('pageToken');
            }

            // Loop until all albums have been listed and no new nextPageToken is
            // returned.
        } while (parameters.has('pageToken'));

    } catch (err: any) {
        // Log the error and prepare to return it.
        error = err;
        logger.error(error);
    }

    logger.info('Albums loaded.');
    return { 
        albums: albums,
        parameters: parameters,
        error: error
    };
}

// Return the body as JSON if the request was successful, or thrown a StatusError.
async function checkStatus(response: fetch.Response) : Promise<any> {
    if (!response.ok) {
        // Throw a StatusError if a non-OK HTTP status was returned.
        let message: any = "";
        try {
            // Try to parse the response body as JSON, in case the server returned a useful response.
            message = await response.json();
        } catch (err) {
            // Ignore if no JSON payload was retrieved and use the status text instead.
        }
        throw new StatusError(response.status, response.statusText, message);
    }

    // If the HTTP status is OK, return the body as JSON.
    return await response.json();
}

app.listen(8080, () => {
    console.log("Listening on port 8080");
});


// check socket IO.
