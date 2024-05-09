$(() => {
    interface IData {
        images: string[];
    }

    let imagesElem = $("#images").get(0) as HTMLDivElement;
    let pageInput = $("#similarPage").get(0) as HTMLInputElement;

    function processRequest(data: IData) {
        for (let img of data.images) {
            const imgElem = $('<img />')
            .attr('src', img)
            .attr('style', "padding: 10px; max-width: 128px; max-height: 128px");
            imgElem.on('contextmenu', customImageMenu);
            imagesElem.appendChild(imgElem.get(0) as HTMLElement);
        }
    }

    function fetch() {
        let page = pageInput.valueAsNumber;
        let url = `/items/read/similar/${page}`;

        $.ajax({
            type: "GET",
            url: url,
            dataType: 'json',
            success: processRequest,
            error: (data) => {
                console.error(data);
            }
        })
    }
    

    function pageChanged() {
        window.location.href = `/similar/${pageInput.valueAsNumber}`
    };

    pageInput.addEventListener("change", (e) => {
        pageChanged();
    })

    $("#similarPagesAdd").on("click", (e) => {
        pageInput.valueAsNumber += 1;
        pageChanged();
    })
    $("#similarPagesRem").on("click", (e) => {
        let result = pageInput.valueAsNumber - 1;
        if (result >= 1) {
            pageInput.valueAsNumber = result;
            pageChanged();
        }
    })

    fetch();
})