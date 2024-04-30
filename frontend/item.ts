

$(() => {
    let searching = false;
    function clear() {
        $("#images").each((idx, elem) => {
            while (elem.lastElementChild) {
                elem.removeChild(elem.lastElementChild);
            }
        })
    }

    $("#searchbtn").on("click", (event) => {
        if (searching) {
            return;
        }

        let count = 50;
        try {
            let value = parseInt(($("#searchCount").get(0) as HTMLInputElement).value);
            if (!isNaN(value)) {
                count = value;
            }
        } catch (err) {
            
        }

        $.ajax({
            method: "GET",
            url: window.location.href + `/similar/${count}`,
            success: (data) => {
                clear();

                let elem = $("#images").get(0) as HTMLElement;

                for (let r of data.results) {
                    const thumbnailImage = $('<img />')
                    .attr('src', r.url)
                    .attr('title', `${r.distance}`)
                    .attr('style', "padding: 10px; max-width: 128px; max-height: 128px");
                    thumbnailImage.on("contextmenu", customImageMenu)
                    elem.appendChild(thumbnailImage.get(0) as HTMLElement);
                }

                searching = false;

            },
            error: (xhr, status, error) => {
                clear();
                showDialog("Error", xhr.responseText);
            }
        })

    })
})