$(() => {
    let lastFetch: string | undefined = undefined;
    let loading = false;
    let imagesElem = $("#images").get(0) as HTMLDivElement;

    function processRequest(data: IData) {
        if (!data.images.length) {
            lastFetch = undefined;
        } else {
            for (let img of data.images) {
                const imgElem = $('<img />')
                .attr('src', img)
                .attr('style', "padding: 10px; max-width: 128px; max-height: 128px");
                // imgElem.on('contextmenu', customImageMenu);
                imagesElem.appendChild(imgElem.get(0) as HTMLElement);
            }
            lastFetch = data.start;
        }
        loading = false;
    }

    function fetch() {
        let count = 100;
        let url = `/duplicates/read/${count}`;
        if (lastFetch) {
            url += `/${lastFetch}`
        }

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
    
    fetch();

    window.addEventListener("scroll", (event) => {
        if (loading || lastFetch === undefined) {
            return;
        }
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

        if (clientHeight + scrollTop >= scrollHeight - 5) {
            // show the loading animation
            loading = true;
            fetch();
        }
    })
})