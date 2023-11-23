import bodyParser from 'body-parser';
import express, { Express, Request, Response } from "express";
import expressWinston from 'express-winston';
import fetch from 'node-fetch';
import http from 'http';
import passport from 'passport';
// import {Strategy as GoogleOAuthStrategy} from 'passport-google-oauth20';
import persist from 'node-persist';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import winston from 'winston';

import { auth } from './auth.js';
import { config } from './config.js';

const app: Express = express();
const fileStore = sessionFileStore(session);
const server = new http.Server(app);

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
app.use((req: any, res: Response, next) => {
    res.locals.name = '-';
    if (req.user && req.user.profile && req.user.profile.name) {
        res.locals.name =
            req.user.profile.name.givenName || req.user.profile.displayName;
    }

    res.locals.avatarUrl = '';
    if (req.user && req.user.profile && req.user.profile.photos) {
        res.locals.avatarUrl = req.user.profile.photos[0].value;
    }
    next();
});


// GET request to the root.
// Display the login screen if the user is not logged in yet, otherwise the
// photo frame.
app.get('/', (req: Request, res: Response) => {
    if (!req.user || !req.isAuthenticated()) {
      // Not logged in yet.
      res.render('login');
    } else {
      res.render('index');
    }
  });


// Star the OAuth login process for Google.
app.get('/auth/google', passport.authenticate('google', {
    scope: config.scopes,
    failureFlash: true,  // Display errors to the user.
    session: true,
}));


app.listen(8080, () => {
    console.log("Listening on port 8080");
});


