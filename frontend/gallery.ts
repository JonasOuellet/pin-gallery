type Order = "asc" | "desc";

$(() => {
    let lastFetch: String | undefined = undefined;
    let loading = false;
    let order  = "asc";
    
    
    function clear() {
        $("#images").each((idx, elem) => {
            while (elem.lastElementChild) {
                elem.removeChild(elem.lastElementChild);
            }
        })
    }
    
    
    function fetch() {
        $("#images").each((idx, elem) => {
            let fetchUrl = `/items/read/${order}/100`;
            if (lastFetch) {
                fetchUrl += `/${lastFetch}`
            }
            $.ajax({
                type: "GET",
                url: fetchUrl,
                dataType: 'json',
                success: (data) => {
                    for (let img of data.images) {
                        const imgElem = $('<img />')
                        .attr('src', img)
                        .attr('style', "padding: 10px; max-width: 128px; max-height: 128px");
                        elem.appendChild(imgElem.get(0) as HTMLElement);
                    }
                    loading = false;
                    lastFetch = data.start;
                },
                error: (data) => {
                    console.error(data);
                }
    
            })
        })
    }
    


    fetch();

    window.addEventListener("scroll", (event) => {
        if (loading) {
            return;
        }
        const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

        let elem = document.documentElement;
        elem.onscrollend

        if (clientHeight + scrollTop >= scrollHeight - 5) {
            // show the loading animation
            loading = true;
            fetch();
        }
    })

    function setMethod(m: Order) {
        order = m;
        lastFetch = undefined;
        clear();
        fetch();
    }

    $("#option-1").on("change", (event) => {
        setMethod("asc");
    });

    $("#option-2").on("change", (event) => {
        setMethod("desc");
    });
})