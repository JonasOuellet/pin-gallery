
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


class PhotoCapture {
    width: number;
    height: number;

    // |streaming| indicates whether or not we're currently streaming
    // video from the camera. Obviously, we start at false.
    stream: MediaStream | null;
    streaming: boolean;

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
        this.streaming = false;
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
        this.clearPhoto();
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
                // setup camera event
                this.video.addEventListener(
                    "canplay",
                    (ev) => {
                        if (!this.streaming) {
                            this.streaming = true;
                        }
                    },
                    false,
                );
            
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
                this.imageScale += event.deltaY * 0.0005;
                this.imagePosition = this.imagePosition.add(new Point2D(
                    (currentWidth - (this.image.width * this.imageScale)) * 0.5,
                    (currentHeight - (this.image.height * this.imageScale)) * 0.5
                ));
                this.drawImageAnimation();
                event.stopPropagation();
                event.preventDefault();
            }
        })
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

        this.image = null;
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
    
    setImageFromInput() {
        this.image = null;
        this.clearPhoto();
        let input = getElemById<HTMLInputElement>("image_input_browsed");
        if (input.files !== null) {
            let file = input.files[0];
            createImageBitmap(file).then((image) => {
                this.imgReceived(image)
            })
        }
    }

    async similarImage(): Promise<{results: {url: string, distance: number}[]}> {
        // https://stackoverflow.com/questions/49826266/nodejs-cannot-upload-file-using-multer-via-ajax
        return this.getImageFile()
            .then((image) => {
                let formData = new FormData();
                formData.append("image", image, "newImage.png");
                formData.append("count", "5");
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
                            reject(error);
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

    // Fill the photo with an indication that none has been
    // captured.
    clearPhoto() {
        this.canvasContext.fillStyle = "#777777";
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

function showViewLiveResultButton(): boolean {
    if (window.self !== window.top) {
        // Ensure that if our document is in a frame, we get the user
        // to first open it in its own tab or window. Otherwise, it
        // won't be able to request permission for camera access.
        let contentarea = document.querySelector(".contentarea");
        if (contentarea !== null) {
            contentarea.remove();
        };
        const button = document.createElement("button");
        button.textContent = "View live result of the example code above";
        document.body.append(button);
        button.addEventListener("click", () => window.open(location.href));
        return true;
    }
    return false;
}

let fetchIntervalNumber: number | null = null;

function fetchIndexWithInterval() {
    if (fetchIntervalNumber !== null) {
        return
    };

    fetchIntervalNumber = setInterval(() => {
        console.log("fetching index status..")
        fetchIndexStatus()
    },
    // check at each minute
    1000  * 60
    ) as any;
}

function undeployInProgess() {
    $("#indexstatus").text("Annulation du deploiement de l'index en court.  Veuillez patienter...");
    $("#indexstatusbar").show();
}

function deployInProgress() {
    $("#indexstatus").text("Deploiement de l'index en court.  Veuillez patienter...");
    $("#indexstatusbar").show();
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
            },
            error: (err) => {
                btn.hide();
                $("#indexstatus").text(`Une erreur est survenue: ${err.responseText}`);
                btn.css("visibility", "hidden");
            }
        })
    }
}


function indexNotDeployed(){
    $("#indexstatus").text("L'index n'est pas deploye.");
    let btn = $("#indexactiondeploy");
    btn.show();
    (btn.get(0) as HTMLElement).onclick = () => {
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
}


function updateState(data: {status: string}) {
    // handle operation first
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
            $("#indexstatus").text("L'index est pret a etre cree");
            // TODO: add button to create index.
        }
        else {
            $("#indexstatus").text(`Ajouter encore ${(data as any).remaining} items pour pouvoir creer l'index.`);
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
            $("#indexstatus").text("Une erreur est survenue: " + data);
            $("#indexstatusbar").hide();
            if (fetchIntervalNumber !== null) {
                clearInterval(fetchIntervalNumber);
                fetchIntervalNumber = null;
            }
        }
    })
}


$(() => {
    $("#recentlyadded").each((idx, elem) => {
        $.ajax({
            type: "GET",
            url: "/items/read",
            dataType: 'json',
            success: (data) => {
                for (let img of data.thumbnails) {
                    const thumbnailImage = $('<img />')
                        .attr('src', img)
                        .attr('style', "padding: 10px; max-width: 64px; max-height: 64px");
                    elem.appendChild(thumbnailImage.get(0) as HTMLElement);
                }
            },
            error: (data) => {
                console.log("Error: ", data);
            }
        })
    })

    fetchIndexStatus();

    if (!showViewLiveResultButton()) {
        let capture = new PhotoCapture;
        capture.clearPhoto();
        capture.init();


        $("#addNewItem").on("click", (event) => {
            // TODO: Implement post request
            capture.setImageInput().then(() => {
                // handle the tag
            }).catch((err) => {
                console.log(err);
            });
        });

        $("#index_search").on("click", (event) => {
            let elem = $("#imageSearchResult");
            if (!elem) {
                throw new Error("Invalid element")
            }
            $("#imageSearchBar").css("visibility", "visible");
            for (let node of elem.find("img")) {
                node.remove();
            }
            for (let node of elem.find("p")) {
                node.remove();
            }
            capture.similarImage()
                .then((res) => {
                    for (let img of res.results) {
                        elem.append($('<img />')
                            .attr('src', img.url)
                            .attr('style', "padding: 10px;")
                        );
                    }
                })
                .catch((err) => {
                    console.log(err);
                    elem.append($("<p />").text(`Une erreur est survenue: ${err}`));
                })
                .finally(() => {
                    // remove loading
                    $("#imageSearchBar").css("visibility", "hidden");
                });
        })
    }
});
