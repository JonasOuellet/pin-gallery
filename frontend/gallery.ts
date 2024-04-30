type Order = "asc" | "desc" | "cluster";

interface IData {
    images: string[];
    start: string;
}

$(() => {
    let lastFetch: string | undefined = undefined;
    let loading = false;
    let order: Order = "asc";

    let imagesElem = $("#images").get(0) as HTMLDivElement;
    let pageInput = $("#similarPage").get(0) as HTMLInputElement;

    function clear() {
        loading = false;
        lastFetch = undefined;
        while (imagesElem.lastElementChild) {
            imagesElem.removeChild(imagesElem.lastElementChild);
        }
    }

    function processRequest(data: IData) {
        if (!data.images.length) {
            lastFetch = undefined;
        } else {
            for (let img of data.images) {
                const imgElem = $('<img />')
                .attr('src', img)
                .attr('style', "padding: 10px; max-width: 128px; max-height: 128px");
                imagesElem.appendChild(imgElem.get(0) as HTMLElement);
            }
            lastFetch = data.start;
        }
        loading = false;
    }

    function fetch() {
        let url = "";
        let count = 100;
        if (order == "cluster") {
            let page = pageInput.valueAsNumber;
            url = `/items/read/similar/${page}`;
        } else {
            url = `/items/read/${order}/${count}`;

        }
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

    function setMethod(m: Order) {
        order = m;
        clear();
        fetch();
    }

    function pageChanged() {
        clear();
        fetch();
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
    
    $("#option-1").on("change", (event) => {
        setMethod("asc");
        $("#similarPagesDiv").hide();
    });
    
    $("#option-2").on("change", (event) => {
        setMethod("desc");
        $("#similarPagesDiv").hide();
    });
    
    $("#option-3").on("change", (event) => {
        setMethod("cluster");
        $("#similarPagesDiv").show();
    });
})