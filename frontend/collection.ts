$(() => {
    // loadQueue();
    // last all collection in the file
    $("#colNameTitle").each((idx, elem) => {
        let colName = elem.innerText;
        $.ajax({
            type: "GET",
            url: `/collections/${colName}/itemimages/read`,
            dataType: 'json',
            success: (data) => {
                let container = $("#itemimages").first();
                for (let img of data.thumbnails) {
                    const thumbnailImage = $('<img />')
                        .attr('src', img + "=w128-h128")
                        .attr('style', "padding: 10px;");
                    container.append(thumbnailImage);
                }
            },
            error: (data) => {
                console.log("Error: ", data);
            }
        })
    })
});