// https://blog.logrocket.com/how-to-set-up-node-typescript-express/
import express, { Express, Request, Response } from "express";

const app: Express = express();
app.set("view engine", "ejs");
app.set("views", "./views");

// Set up static routes for hosted libraries.
app.use(express.static("./static"));

app.get("/", (req: Request, res: Response) => {
    res.render("index.ejs");
});

app.listen(8080, () => {
    console.log("Listening on port 8080");
});