
function getElemById<T>(id: string): T {
    let elem = document.getElementById(id);
    if (elem === null) {
        throw new Error(`Couldn't find element with id: ${id}`)
    }
    return elem as T;
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

    _isMoving: boolean = false;
    _initalPos: Point2D = Point2D.origin();
    imagePosition: Point2D = Point2D.origin();
    _initialImagePosition: Point2D = Point2D.origin();

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

        if (this._isMoving) {
            requestAnimationFrame((time) => this.drawImageAnimation());
        } 
    }

    beginMoving(event: MouseEvent) {
        if (event.button === 0 && this.image){
            // tell the browser we're handling this mouse event
            // https://stackoverflow.com/questions/28284754/dragging-shapes-using-mouse-after-creating-them-with-html5-canvas

            // set move cursor
            document.body.style.cursor = "move";
 
            this._initalPos = new Point2D(event.x, event.y);
            this._initialImagePosition = new Point2D(this.imagePosition.x, this.imagePosition.y);
            
            event.preventDefault();
            event.stopPropagation();
            // start drawing the image
            this._isMoving = true;
            this.drawImageAnimation()
        }
     }
  
     endMoving(event: MouseEvent) {
        if (this._isMoving) {
            document.body.style.cursor = "auto";
            event.preventDefault();
            event.stopPropagation();
            this._isMoving = false;
        }
     }
  
    move(event: MouseEvent) {
        if (this._isMoving) {
            let relPos = new Point2D(event.x, event.y).sub(this._initalPos);
            relPos.x *= this.canvas.width / this.canvas.clientWidth;
            relPos.y *= this.canvas.height / this.canvas.clientHeight;
            this.imagePosition = this._initialImagePosition.add(relPos);
            event.preventDefault();
            event.stopPropagation();
        }
    }

    init() {
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: false })
            .then((stream) => {
                this.stream = stream;
                this.video.srcObject = stream;
                this.video.play();

                getElemById<HTMLButtonElement>("captureBtn").addEventListener(
                    "click",
                    (ev) => {
                        this.takePicture();
                        ev.preventDefault();
                    },
                    false,
                );
            })
            .catch((err) => {
                console.error(`Couldn't find camera: ${err}`);
            });
    
        // setup other event
        this.canvas.addEventListener("mousedown", (event) => this.beginMoving(event));
        window.addEventListener("mouseup", (event) => this.endMoving(event));
        window.addEventListener("mousemove", (event) => this.move(event));
        this.canvas.addEventListener("wheel", (event) => {
            if (this.image) {
                // scale from center
                let currentWidth = this.image.width * this.imageScale;
                let currentHeight = this.image.height * this.imageScale;
                this.imageScale += -event.deltaY * 0.0005;
                this.imagePosition = this.imagePosition.add(new Point2D(
                    (currentWidth - (this.image.width * this.imageScale)) * 0.5,
                    (currentHeight - (this.image.height * this.imageScale)) * 0.5
                ));
                this.drawImageAnimation();
                event.stopPropagation();
                event.preventDefault();
            }
        })

        $("#addNewItem").on("click", (event) => {
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
                            let dialog = document.querySelector("#itemaddeddialog") as HTMLDialogElement;
                            (dialog.querySelector("img") as HTMLImageElement).src = data.url;
                            (dialog.querySelector("#imgdialogok") as HTMLButtonElement).onclick = () => {
                                this.clearPhoto();
                                dialog.close();
                                addNewImageElement(data.url, null, true);
                                // increment the number of items by one.
                                let span = getElemById<HTMLSpanElement>("itemcount");
                                span.innerText = (Number(span.innerText) + 1).toString();
                                this.clearSimilarImages();
                            }
                            dialog.showModal();
                        },
                        error: (xhr, status, error) => {
                            showDialog("Erreur", xhr.responseText);
                        }
                    })
                }
            )
        });
    
        $("#index_search").on("click", (event) => {
            let elem = $("#imageSearchResult");
            if (!elem) {
                throw new Error("Invalid element")
            }
            $("#imageSearchBar").show();
            this.clearSimilarImages();

            this.similarImage()
                .then((res) => {
                    for (let img of res.results) {
                        elem.append($('<img />')
                            .attr('src', img.url)
                            .attr('style', "padding: 10px; max-width: 15%")
                        );
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


function initAddNewItem() {
    if (collectionneur === null) {
        collectionneur = new Collectionneur();
        collectionneur.init();
    }
    collectionneur.clearPhoto();
    // show the foirm
    $("#addnewitem").show();
}

function uninitAddNewItem() {
    // simply hide the form
    $("#addnewitem").hide();
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


function updateState(data: {status: string}) {
    // handle operation first
    if (data.status === "createIndexOperation" || data.status === "createEndPointOpreation") {
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
        console.log("index is being undeployed")
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
                createIndexInProgress();
                fetchIndexWithInterval(30_000);
                $.ajax({
                    type: "GET",
                    url: "/createindex",
                    dataType: 'json',
                    success: (data) => {
                        // do nothing for now already in progress
                        console.log(data);
                    },
                    error: (data) => {
                        console.log(data);
                        $("#indexstatus").text(`Une erreur est survenu: ${data.responseText}`);
                        $("#indexstatusbar").hide();
                    }
                });
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
    (dialog.querySelector("#dialogtitle") as HTMLTitleElement).innerText = title;
    (dialog.querySelector("#dialogcontent") as HTMLParagraphElement).innerText = content;
    (dialog.querySelector("#dialogok") as HTMLButtonElement).onclick = () => {
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
        if (elem.lastElementChild) {
            elem.lastElementChild.remove();
        }
        if (elem.firstElementChild) {
            elem.insertBefore(thumbnailImage.get(0) as HTMLElement, elem.firstElementChild);
            return;
        }
    }
    elem.appendChild(thumbnailImage.get(0) as HTMLElement);
}


$(() => {
    $("#recentlyadded").each((idx, elem) => {
        $.ajax({
            type: "GET",
            url: "/items/read",
            dataType: 'json',
            success: (data) => {
                for (let img of data.thumbnails) {
                    addNewImageElement(img, elem, false);
                }
            },
            error: (data) => {
                console.log("Error: ", data);
            }
        })
    })

    fetchIndexStatus();       
});
