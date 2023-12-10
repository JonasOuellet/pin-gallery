import * as readline from "readline";
import * as crypto from "crypto";
import { Firestore } from "@google-cloud/firestore";



const db = new Firestore({
    projectId: process.env.PROJECT_ID,
    databaseId: "collector"
});

async function main() {
    const rline = readline.createInterface(process.stdin, process.stdout);
    rline.question("Enter Admin password.  Default (Admin).", async (awnser) => {
        if (!awnser) {
            awnser = "Admin";
        }

        try {
            let currentUser = await db.collection("Users")
                .where("username", "==", "Admin")
                .get();
            if (currentUser.docs.length === 0) {
                let salt = crypto.randomBytes(16);
                crypto.pbkdf2(awnser, salt, 310000, 32, 'sha256', async (err, hashedPassword) => {
                    if (err) {
                        throw err;
                    }
                    let ref = db.collection("Users").doc();
                    await ref.set({
                        username: "Admin",
                        password: hashedPassword,
                        salt: salt,
                        id: ref.id
                    });
                    console.log(`Password successfully set to ${awnser}`);
                    process.exit(0);
                });
            }
            else {
                let user = currentUser.docs[0];
                let data = user.data()
                crypto.pbkdf2(awnser, data.salt, 310000, 32, 'sha256', async (err, hashedPassword) => {
                    if (err) {
                        throw err;
                    }
                    await user.ref.update({
                        password: hashedPassword,
                    });
                    console.log(`Password successfully updated to ${awnser}`);
                    process.exit(0);
                });
            }
        }
        catch (err) {
            console.log(err);
            return;
        }
    });
}
await main();