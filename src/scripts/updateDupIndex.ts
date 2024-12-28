import * as utils from "./indexUtils";

// Clean the duplicate index.
async function main() {
    const user = await utils.getUser()
    let items = await utils.getItemData(user, "duplicates");
    await utils.vectorizeItems(items);
    const index = "collectordup"
    await utils.clearIndex(index, Object.keys(items))
    await utils.insertDatapoints(index, items);
}


main()
