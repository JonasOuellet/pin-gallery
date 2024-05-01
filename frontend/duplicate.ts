$(() => {
    let lastFetch: string | undefined = undefined;
    let loading = false;
    let imagesElem = $("#images").get(0) as HTMLDivElement;


    function customDupMenu(event: JQuery.ContextMenuEvent) {
        let imgElement = event.target as HTMLImageElement;

        let menu = $("#image_menu");
        (menu.get(0) as any).style.display = null;
        menu.css("transition-delay", "0.12s");
        let width = menu.width();
        let height = menu.height();
        let parentdiv = menu.parent();
        parentdiv.addClass("is-visible");
        parentdiv.css("left", `${event.pageX}px`);
        parentdiv.css("top", `${event.pageY}px`);
        let contour = parentdiv.children("div");
        contour.css("width", `${width}px`);
        contour.css("height", `${height}px`);
        menu.css("clip", `rect(0px, ${width}px, ${height}px, 0px)`);
    
        let closeMenu = () => {
            parentdiv.removeClass("is-visible");
            (menu.get(0) as any).style.clip = null;
            document.removeEventListener("click", documentCloseMenu);
        };
    
        let documentCloseMenu = () => {
            closeMenu();
        };
    
        document.addEventListener("click", documentCloseMenu);
        let imageID = (imgElement.src.split("/").pop() as string).split('.')[0];
    
        let [deleteAction] = menu.children();

        deleteAction.onclick = (ev) => {
            closeMenu();
            // popup the dialog
            let dialog = $("#deletedialog");
            let dialogElem = dialog.get(0) as HTMLDialogElement;
            let dialogImg = $("img", dialog).get(0) as HTMLImageElement;
            dialogImg.src =  imgElement.src;
            let [okbtn, cancelbtn] = $("button", dialog);
            cancelbtn.onclick = () => {dialogElem.close()};
            okbtn.onclick = () => {
                $.ajax({
                    url: `/duplicate/delete/${imageID}`,
                    method: "GET",
                    processData: false,
                    contentType: false,
                    success: (data) => {
                        dialogElem.close();
                        dialogImg.src = "";
                        // remove the element from the list of 5
                        imgElement.remove();
                    },
                    error: (xhr, status, error) => {
                        dialogElem.close();
                        dialogImg.src = "";
                        showDialog("Error Occured", xhr.responseText);
                    }
                });
            }
    
            dialogElem.showModal();
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
        };
    
        event.preventDefault();
    }

    function processRequest(data: IData) {
        if (!data.images.length) {
            lastFetch = undefined;
        } else {
            for (let img of data.images) {
                const imgElem = $('<img />')
                .attr('src', img)
                .attr('style', "padding: 10px; max-width: 128px; max-height: 128px");
                imgElem.on('contextmenu', customDupMenu);
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