
function customImageMenu(
    event: JQuery.ContextMenuEvent,
    onImageRemoved?: (id: string) => void
) {
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

    let [
        openInNewTab,
        showMoreInfo,
        addToDupp,
        deleteAction
    ] = menu.children();
    openInNewTab.onclick = (ev) => {
        closeMenu();
        window.open(imgElement.src, '_blank');
    }
    
    showMoreInfo.onclick = (ev) => {
        closeMenu();
        window.open(`/item/${imageID}`, '_blank');
    }

    function deleteImage(ev: MouseEvent, dialogId: string, getUrl: string) {
        closeMenu();
        // popup the dialog
        let dialog = $(dialogId);
        let dialogElem = dialog.get(0) as HTMLDialogElement;
        let dialogImg = $("img", dialog).get(0) as HTMLImageElement;
        dialogImg.src =  imgElement.src;
        let [okbtn, cancelbtn] = $("button", dialog);
        cancelbtn.onclick = () => {dialogElem.close()};
        okbtn.onclick = () => {
            $.ajax({
                url: `${getUrl}${imageID}`,
                method: "GET",
                processData: false,
                contentType: false,
                success: (data) => {
                    dialogElem.close();
                    dialogImg.src = "";
                    // remove the element from the list of 5
                    imgElement.remove();
                    if (onImageRemoved !== undefined) {
                        onImageRemoved(imageID);
                    }
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

    addToDupp.onclick = (ev) => {
        deleteImage(ev, "#duplicatedialog", "/duplicate/create/");
    }
    
    deleteAction.onclick = (ev) => {
        deleteImage(ev, "#deletedialog", "/item/delete/");

    }

    event.preventDefault();
}