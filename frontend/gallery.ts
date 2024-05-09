$(() => {
    type Order = "asc" | "desc";
    
    interface IData {
        images: string[];
        start: string;
    }

    let lastFetch: string | undefined = undefined;
    let loading = false;
    let order: Order = "asc";

    let imagesElem = $("#images").get(0) as HTMLDivElement;
    let textElem = $("#sample1").get(0) as HTMLInputElement;
    textElem.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            clear()
            fetch();
        }
    })

    $("#searchBtn").on("click", () => {
        clear();
        fetch();
    })

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
                imgElem.on('contextmenu', customImageMenu);
                imagesElem.appendChild(imgElem.get(0) as HTMLElement);
            }
            lastFetch = data.start;
        }
        loading = false;
    }

    function fetch() {
        let count = 100;
        let url = `/items/read/${order}/${count}`;

        if (lastFetch) {
            url += `/${lastFetch}`;
        }

        let data: any | undefined = undefined;
        if (textElem.value) {
            data = {text: textElem.value};
        }

        $.ajax({
            type: "GET",
            url: url,
            data: data,
            dataType: 'json',
            success: processRequest,
            error: (data) => {
                console.error(data);
            }
        })
    }
    
    fetch();

    function installScrollEvent() {
        let container = $(".mdl-layout__container").get(0);
        if (container && container.children.length >= 1) {
            let child = container.children[0];
            child.addEventListener("scroll", (event) => {
                if (loading || lastFetch === undefined) {
                    return;
                }
                const { scrollTop, scrollHeight, clientHeight } = child;
                if (clientHeight + scrollTop >= scrollHeight - 5) {
                    // show the loading animation
                    loading = true;
                    fetch();
                }
            });
        } else {
            requestAnimationFrame(installScrollEvent);
        };
    }

    installScrollEvent();


    function setMethod(m: Order) {
        order = m;
        clear();
        fetch();
    }

    
    $("#option-1").on("change", (event) => {
        setMethod("asc");
        $("#similarPagesDiv").hide();
    });
    
    $("#option-2").on("change", (event) => {
        setMethod("desc");
        $("#similarPagesDiv").hide();
    });
    
})