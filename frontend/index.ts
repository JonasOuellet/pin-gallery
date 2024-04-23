
function getElemById<T>(id: string): T {
    let elem = document.getElementById(id);
    if (elem === null) {
        throw new Error(`Couldn't find element with id: ${id}`)
    }
    return elem as T;
}

enum EditMode {
    None,
    Zoom,
    Move
}


class Point2D{
    x: number;
    y: number;
 
    constructor(x: number, y: number) {
       this.x = x;
       this.y = y;
    }
 
    static origin() : Point2D {
       return new Point2D(0, 0);
    }
 
    static fromMouseEvent(event: MouseEvent) : Point2D {
       return new Point2D(event.offsetX, event.offsetY);
    }
 
    add(other: Point2D) : Point2D {
       return new Point2D(this.x + other.x, this.y + other.y);
    }
 
    sub(other: Point2D) : Point2D {
       return new Point2D(this.x - other.x, this.y - other.y);
    }
    
}

class Rect {
    x: number;
    y: number;
    width: number;
    height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}


class Collectionneur {
    width: number;
    height: number;

    // video from the camera. Obviously, we start at false.
    stream: MediaStream | null;

    video: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    image: ImageBitmap | null;
    imageScale: number = 1;

    _editMode: EditMode = EditMode.None;
    _initalPos: Point2D = Point2D.origin();
    imagePosition: Point2D = Point2D.origin();
    _initialImagePosition: Point2D = Point2D.origin();
    _initialScale: number = 1;

    similarItemSearchCount: number = 5;

    constructor() {
        this.width = 256;
        this.height = 256;

        this.video = getElemById<HTMLVideoElement>("video");
        this.canvas = getElemById<HTMLCanvasElement>("canvas");
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        const context = this.canvas.getContext("2d");
        if (context === null) {
            throw new Error("Cannot get context from canvas.");
        }
        this.canvasContext = context;

        this.stream = null;
        this.image = null;
    }

    drawImageAnimation() {
        this.clearCanvas();
        if (this.image !== null) {
            this.canvasContext.drawImage(
                this.image,
                0,
                0,
                this.image.width,
                this.image.height,
                this.imagePosition.x,
                this.imagePosition.y,
                this.image.width * this.imageScale,
                this.image.height * this.imageScale
            );

        }

        if (this._editMode != EditMode.None) {
            requestAnimationFrame((time) => this.drawImageAnimation());
        } 
    }

    beginMoving(event: MouseEvent) {
        if (!this.image) {
            return;
        }
        if (this._editMode != EditMode.None) {
            return;
        }

        if (event.button === 0) {
            // set move cursor
            document.body.style.cursor = "move";
            this._editMode = EditMode.Move;
        }
        else if (event.button === 1) {
            document.body.style.cursor = "zoom-in";
            this._editMode = EditMode.Zoom;
        }
        else { 
            return; 
        }

        this._initalPos = new Point2D(event.x, event.y);
        this._initialImagePosition = new Point2D(this.imagePosition.x, this.imagePosition.y);
        this._initialScale = this.imageScale;

        event.preventDefault();
        event.stopPropagation();
        this.drawImageAnimation()
        this.drawImageAnimation()
    }
  
    endMoving(event: MouseEvent) {
        if (
            (event.button === 0 && this._editMode == EditMode.Move) ||
            (event.button === 1 && this._editMode == EditMode.Zoom)
        ) {
            document.body.style.cursor = "auto";
            this._editMode = EditMode.None;
            event.preventDefault();
            event.stopPropagation();
        }
    }

    move(event: MouseEvent) {
        if (!this.image || this._editMode == EditMode.None) {
            return;
        }
        if (this._editMode == EditMode.Move) {
            let relPos = new Point2D(event.x, event.y).sub(this._initalPos);
            relPos.x *= this.canvas.width / this.canvas.clientWidth;
            relPos.y *= this.canvas.height / this.canvas.clientHeight;
            this.imagePosition = this._initialImagePosition.add(relPos);
        }
        else if (this._editMode == EditMode.Zoom) {
            let scaleValue = event.x - this._initalPos.x;
            if (scaleValue < 0) {
                document.body.style.cursor = "zoom-out";
            } else {
                document.body.style.cursor = "zoom-in";
            }
            this.imageScale = this._initialScale + scaleValue * 0.001;
            let currentWidth = this.image.width * this._initialScale;
            let currentHeight = this.image.height * this._initialScale;
            this.imagePosition = this._initialImagePosition.add(new Point2D(
                (currentWidth - (this.image.width * this.imageScale)) * 0.5,
                (currentHeight - (this.image.height * this.imageScale)) * 0.5
            ));
        }
        event.preventDefault();
        event.stopPropagation();
    }

    init() {
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: false })
            .then((stream) => {
                this.stream = stream;
                this.video.srcObject = stream;
                this.video.play();

                let btn = getElemById<HTMLButtonElement>("captureBtn");
                btn.addEventListener(
                    "click",
                    (ev) => {
                        this.takePicture();
                        ev.preventDefault();
                    },
                    false,
                );
                btn.addEventListener(
                    "contextmenu",
                    (ev) => {
                        let elem = getElemById<HTMLInputElement>("browseImg");
                        elem.click();
                        elem.onchange = ((ev) => {
                            if (elem.files) {
                                let file = elem.files[0];
                                createImageBitmap(file).then((image) => {
                                    this.imgReceived(image);
                                });
                            }
                        })
                        ev.preventDefault();
                        ev.stopPropagation();
                    }
                )
            })
            .catch((err) => {
                console.error(`Couldn't find camera: ${err}`);
            });
    
        // setup other event
        this.canvas.addEventListener("mousedown", (event) => this.beginMoving(event));
        window.addEventListener("mouseup", (event) => this.endMoving(event));
        window.addEventListener("mousemove", (event) => this.move(event));

        $("#addnewitem").on("click", (event) => {
            // https://stackoverflow.com/questions/49826266/nodejs-cannot-upload-file-using-multer-via-ajax
           this.getImageFile()
                .then((image) => {
                    let formData = new FormData();
                    formData.append("image", image, "newImage.png");
                    $.ajax({
                        url: "/item/create",
                        data: formData,
                        method: "POST",
                        processData: false,
                        contentType: false,
                        success: (data) => {
                            let span = getElemById<HTMLSpanElement>("itemcount");
                            let newCount = Number(span.innerText) + 1;
                            span.innerText = newCount.toString();

                            let dialog = document.querySelector("#itemaddeddialog") as HTMLDialogElement;
                            // clear old images
                            let img = (dialog.querySelector("img") as HTMLImageElement);
                            img.src = "";
                            img.src = data.url;
                            let btn = dialog.querySelector("#imgdialogok") as HTMLButtonElement;
                            let btn2 = dialog.querySelector("#imgdialog2") as HTMLButtonElement;
                            let p = dialog.querySelector("p") as HTMLParagraphElement;

                            this.clearPhoto();
                            this.clearSimilarImages();
                            addNewImageElement(data.url, null, true);

                            if (!isIndexValid && newCount >= 10) {
                                // show the dialog that inform user that he can create the index.
                                btn.innerText = "Creer maintenant";
                                (btn2.style as any).display = null;
                                btn2.innerText = "Creer plus tard"
                                p.innerText = "Nouvelle item ajoute avec succes.  Il y assez d'item pour creer l'index.  Voulez vous creer l'index maintenant?"
                                
                                btn.onclick = () => {
                                    createIndex();
                                    dialog.close();
                                }
                                btn2.onclick = () => {
                                    dialog.close();
                                };

                                dialog.showModal();

                            } else {
                                if (!isIndexValid) {
                                    // show the dialog that inform the user that the elem has been added.
                                    fetchIndexStatus();
                                }
                                btn.innerText = "Ok!";
                                btn2.style.display = "none";
                                p.innerText = "Nouvelle item ajoute avec succes.";

                                btn.onclick = () => {
                                    dialog.close();
                                }
                                dialog.showModal();
                            }
                        },
                        error: (xhr, status, error) => {
                            showDialog("Erreur", xhr.responseText);
                        }
                    })
                }
            )
        });

        let indexSearch = $('#index_search');
        let indexSearchBtn = indexSearch[0];
        let fnUpdateText = () => {
            indexSearchBtn.innerText = `RECHERCHER ${this.similarItemSearchCount} ITEMS SIMILAIRES`;
        }

        try {
            this.similarItemSearchCount = parseInt(indexSearchBtn.innerText.trimStart().split(' ')[1], 10);
            if (Number.isNaN(this.similarItemSearchCount)) {
                this.similarItemSearchCount = 5;
                fnUpdateText();
            }
        } catch {
            fnUpdateText();
        }

        $("#index_search_add").on("click", (event) => {
            this.similarItemSearchCount = Math.min(50, this.similarItemSearchCount + 1);
            fnUpdateText();
        })

        $("#index_search_rem").on("click", (event) => {
            this.similarItemSearchCount = Math.max(2, this.similarItemSearchCount - 1);
            fnUpdateText();
        })

        indexSearch.on("click", (event) => {
            let elem = $("#imageSearchResult");
            if (!elem) {
                throw new Error("Invalid element")
            }
            $("#imageSearchBar").show();
            this.clearSimilarImages();

            this.similarImage()
                .then((res) => {
                    for (let img of res.results) {
                        let imgElem = $('<img />');
                        imgElem.attr('src', img.url);
                        imgElem.attr('style', "padding: 10px; max-width: 15%")
                        imgElem.on('contextmenu', this.removeContextMenu);
                        elem.append(imgElem);
                    }
                })
                .catch((err) => {
                    elem.append($("<p />").text(`Une erreur est survenue: ${err}`));
                })
                .finally(() => {
                    // remove loading
                    $("#imageSearchBar").hide();
                });
        })

    }

    removeContextMenu(event: JQuery.ContextMenuEvent) {
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

        let deleteAction = menu.children()[0];
        deleteAction.onclick = (ev) => {
            closeMenu();
            let imageID = (imgElement.src.split("/").pop() as string).split('.')[0];

            // popup the dialog
            let dialog = $("#deletedialog");
            let dialogElem = dialog.get(0) as HTMLDialogElement;
            let dialogImg = $("img", dialog).get(0) as HTMLImageElement;
            dialogImg.src =  imgElement.src;
            let [okbtn, cancelbtn] = $("button", dialog);
            cancelbtn.onclick = () => {dialogElem.close()};
            okbtn.onclick = () => {
                $.ajax({
                    url: `/item/delete/${imageID}`,
                    method: "GET",
                    processData: false,
                    contentType: false,
                    success: (data) => {
                        dialogElem.close();
                        dialogImg.src = "";
                        // remove the element from the list of 5
                        imgElement.remove();
                        updateRecentlyAdded();
                        updateCount();
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
        }
        event.preventDefault();
    }

    clearSimilarImages() {
        let elem = $("#imageSearchResult");
        for (let node of elem.find("img")) {
            node.remove();
        }
        for (let node of elem.find("p")) {
            node.remove();
        }
    }

    imgReceived(image: ImageBitmap) {
        this.image = image;
        // calculate the scale
        this.imageScale = this.height / this.image.height;
        let scaledWith = this.image.width * this.imageScale;
        this.imagePosition = new Point2D((this.width / 2) - (scaledWith / 2), 0);
        this.drawImageAnimation();
    };

    // Capture a photo by fetching the current contents of the video
    // and drawing it into a canvas, then converting that to a PNG
    // format data URL. By drawing it on an offscreen canvas and then
    // drawing that to the screen, we can change its size and/or apply
    // other changes before drawing it.
    takePicture() {
        this.clearPhoto();
        if (this.stream !== null) {
            if (typeof(ImageCapture) === 'undefined') {
                createImageBitmap(this.video).then((image) => {
                    this.imgReceived(image)
                })
            } else {
                let track = this.stream.getVideoTracks()[0];
                // https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Image_Capture_API#browser_compatibility
                
                let imageCap = new ImageCapture(track);
                imageCap.grabFrame().then(
                    (image) => {
                        this.imgReceived(image);
                    }
                )
            }
        }
    }

    async similarImage(): Promise<{results: {url: string, distance: number}[]}> {
        // https://stackoverflow.com/questions/49826266/nodejs-cannot-upload-file-using-multer-via-ajax
        return this.getImageFile()
            .then((image) => {
                let formData = new FormData();
                formData.append("image", image, "newImage.png");
                formData.append("count", this.similarItemSearchCount.toString());
                return new Promise((resolve, reject) => {
                    $.ajax({
                        url: "/item/similarimage",
                        data: formData,
                        method: "POST",
                        processData: false,
                        contentType: false,
                        success: (data) => {
                            resolve(data);
                        },
                        error: (xhr, status, error) => {
                            reject(xhr.responseText);
                        }
                    })
                })
            })
    }

    async getImageFile(): Promise<File> {
        // https://stackoverflow.com/questions/23511792/attach-a-blob-to-an-input-of-type-file-in-a-form
        let result = await new Promise<Blob | null>((b) => this.canvas.toBlob(b, "image/png"));
        if (result === null) {
            return Promise.reject(new Error("Cannot getting the image data."))
        }
        let filename = "newImage";
        let file = new File([result], filename + ".png", {type: "image/png", lastModified: new Date().getTime()});
        return file;
    }

    clearCanvas() {
        this.canvasContext.fillStyle = "#777777";
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    clearPhoto() {
        this.clearCanvas();
        this.image = null;
        this.imageScale = 1;
    }
}

let fetchIntervalNumber: number | null = null;
let isDeployingIndex = false;
let isCreatingIndex = false;
let collectionneur: Collectionneur | null = null;
let isIndexValid = false;


function initAddNewItem() {
    if (collectionneur === null) {
        collectionneur = new Collectionneur();
        collectionneur.init();
    }
    collectionneur.clearPhoto();
    // show the foirm
    $("#addnewitemcard").show();
}

function uninitAddNewItem() {
    // simply hide the form
    $("#addnewitemcard").hide();
}

function fetchIndexWithInterval(time: number = 60_000) {
    if (fetchIntervalNumber !== null) {
        return
    };

    fetchIntervalNumber = setInterval(() => {
        console.log("fetching index status..")
        fetchIndexStatus()
    },
    time
    ) as any;
}


function createIndexInProgress() {
    isCreatingIndex = true;
    $("#indexstatus").text("Creation de l'index en cours.  Veuillez patienter...");
    $("#indexstatusbar").show();
}

function undeployInProgess() {
    $("#indexstatus").text("Annulation du deploiement de l'index en court.  Veuillez patienter...");
    $("#indexstatusbar").show();
}

function deployInProgress() {
    $("#indexstatus").text("Deploiement de l'index en court.  Veuillez patienter...");
    $("#indexstatusbar").show();
    isDeployingIndex = true;
}


function indexValid() {
    isIndexValid = true;
    $("#index_search").show();
    $("#indexstatus").text("L'index est deploye est pret a etre utilise.  Vous pouvez annuler le deploiment lorsque vous n'avez plus besoin de l'index pour economiser des frais d'execution.");
    let btn = $("#indexactionundeploy");
    btn.show();
    (btn.get(0) as HTMLElement).onclick = () => {
        $.ajax({
            type: "GET",
            url: "/undeployindex",
            success: (data) => {
                btn.hide();
                undeployInProgess();
                fetchIndexWithInterval();
                uninitAddNewItem();
            },
            error: (err) => {
                btn.hide();
                $("#indexstatus").text(`Une erreur est survenue: ${err.responseText}`);
                btn.css("visibility", "hidden");
            }
        })
    }

    // if the index was behing deployed show the dialog
    if (isDeployingIndex) {
        showDialog(
            "Index Deploye",
            "L'index est deploye et pret a etre utilise."
            );
            isDeployingIndex = false;
    }

    initAddNewItem();
}


function deployIndex() {
    let btn = $("#indexactiondeploy");
    $.ajax({
        type: "GET",
        url: "/deployindex",
        success: (data) => {
            btn.hide();
            deployInProgress();
            fetchIndexWithInterval();
        },
        error: (err) => {
            btn.hide();
            $("#indexstatus").text(`Une erreur est survenue: ${err.responseText}.`);
            btn.css("visibility", "hidden");
        }
    })
}


function indexNotDeployed() {
    $("#indexstatus").text("L'index n'est pas deploye.  Veuillez deployer l'index avant de pouvoir ajouter des nouveaux items.");
    let btn = $("#indexactiondeploy");
    btn.show();
    (btn.get(0) as HTMLElement).onclick = () => {
        deployIndex();
    }

    if (isCreatingIndex) {
        isCreatingIndex = false;
        let dialog = document.querySelector("#deploydialog") as HTMLDialogElement;
        (dialog.querySelector("#deploynow") as HTMLButtonElement).onclick = () => {
            deployIndex();
            dialog.close();
        }
        (dialog.querySelector("#deploylater") as HTMLButtonElement).onclick = () => {
            dialog.close();
        }
        dialog.showModal();
    }
};


function createIndex() {
    uninitAddNewItem();
    createIndexInProgress();
    $.ajax({
        type: "GET",
        url: "/createindex",
        dataType: 'json',
        success: (data) => {
            // do nothing for now already in progress
            fetchIndexWithInterval(30_000);
        },
        error: (data) => {
            console.log(data);
            $("#indexstatus").text(`Une erreur est survenu: ${data.responseText}`);
            $("#indexstatusbar").hide();
        }
    });
}


function updateState(data: {status: string}) {
    // handle operation first
    isIndexValid = false;
    if (data.status === "IndexIsBeingCreated" || data.status === "EndpointIsBeingCreated") {
        createIndexInProgress();
        // fetch status if not already fetching fetch faster for create index
        fetchIndexWithInterval(30_000);
        return;
    }

    if (data.status === "IndexIsBeingDeployed") {
        deployInProgress();
        // fetch status if not already fetching
        fetchIndexWithInterval();
        return;
    }

    if (data.status === "IndexIsBeingUndeployed") {
        undeployInProgess();
        // fetch status if not already fetching
        fetchIndexWithInterval();
        return;
    }

    // no operation is running so stop the fetch
    if (fetchIntervalNumber !== null) {
        clearInterval(fetchIntervalNumber);
        fetchIntervalNumber = null;
    }

    if (data.status === "IndexNotDeployed") {
        indexNotDeployed();
    }
    else if (data.status === "IndexDoesntExist") {
        if ((data as any).remaining > 0) { 
            $("#indexstatus").text(`Ajouter encore ${(data as any).remaining} items pour pouvoir creer l'index.`);
            initAddNewItem();
        }
        else {
            $("#indexstatus").text("L'index est pret a etre cree");

            let btn = $("#indexactioncreate");
            btn.show();
            (btn.get(0) as HTMLElement).onclick = () => {
                btn.hide();
                createIndex();
            }
        }
    }
    else if (data.status === "IndexValid") {
        indexValid();
    }
    $("#indexstatusbar").hide();
}


function fetchIndexStatus() {
    $.ajax({
        type: "GET",
        url: "/indexstatus",
        dataType: "json",
        success: (data) => {
            updateState(data);
        },
        error: (data) => {
            $("#indexstatus").text("Une erreur est survenue: " + data.responseText);
            $("#indexstatusbar").hide();
            if (fetchIntervalNumber !== null) {
                clearInterval(fetchIntervalNumber);
                fetchIntervalNumber = null;
            }
        }
    })
}

function showDialog(title: string, content: string) {
    let dialog = document.querySelector("#simplemsgdialog") as HTMLDialogElement;
    (dialog.querySelector("h2") as HTMLHeadElement).innerText = title;
    (dialog.querySelector("p") as HTMLParagraphElement).innerText = content;
    (dialog.querySelector("button") as HTMLButtonElement).onclick = () => {
        dialog.close();
    }
    dialog.showModal();
}


function addNewImageElement(url: string, elem: HTMLElement | null, insertAndRemoveLast: boolean) {
    if (!elem) {
        elem = $("#recentlyadded").get(0) as HTMLElement;
    }
    const thumbnailImage = $('<img />')
    .attr('src', url)
    .attr('style', "padding: 10px; max-width: 64px; max-height: 64px");
    if (insertAndRemoveLast) {
        // 20 is the number of image that are displayed
        if (elem.lastElementChild && elem.children.length >= 20) {
            elem.lastElementChild.remove();
        }
        if (elem.firstElementChild) {
            elem.insertBefore(thumbnailImage.get(0) as HTMLElement, elem.firstElementChild);
            return;
        }
    }
    elem.appendChild(thumbnailImage.get(0) as HTMLElement);

    // make sure to show the div
    (elem.parentNode as any).style.display = null;
}


function updateRecentlyAdded() {
    let recentlyAdded = $("#recentlyadded");
    recentlyAdded.children().remove();
    recentlyAdded.each((idx, elem) => {
        $.ajax({
            type: "GET",
            url: "/items/recentlyadded",
            dataType: 'json',
            success: (data) => {
                for (let img of data.thumbnails) {
                    addNewImageElement(img, elem, false);
                }
            },
            error: (data) => {
                console.error(data);
            }
        })
    })
}

function updateCount() {
    $.ajax({
        type: "GET",
        url: "/items/count",
        dataType: "json",
        success: (data) => {
            let span = getElemById<HTMLSpanElement>("itemcount");
            let newCount = data.count;
            span.innerText = newCount.toString(); 
        },
        error: (data) => {
            console.error(data);
        }
    })
}


$(() => {
    $("#collectionBtn").on("click", () => {
        window.location.href = "/gallery";
    });
    updateRecentlyAdded();
    fetchIndexStatus();
});
