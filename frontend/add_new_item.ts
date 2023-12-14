
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


enum MouseMoveEvent {
    None,
    Move,
    Rect,
    Rotate
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

    mouseEvent: MouseMoveEvent = MouseMoveEvent.None;
    _initalPos: Point2D = Point2D.origin();
    imagePosition: Point2D = Point2D.origin();
    _initialImagePosition: Point2D = Point2D.origin();

    _selRectInitial: Point2D | null;
    _selRectNew: Point2D | null;

    rotation: number = 0;

    constructor() {
        this.streaming = false;
        this.width = 1280;
        this.height = 720;

        this._selRectInitial = null;
        this._selRectNew = null;

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

    getRect(): [number, number, number, number] | null {
        if (this._selRectInitial === null || this._selRectNew === null) {
            return null;
        }
        let [minX, maxX] = [this._selRectInitial.x, this._selRectNew.x].sort();
        let [minY, maxY] = [this._selRectInitial.y, this._selRectNew.y].sort();

        return [
            minX,
            minY,
            maxX - minX,
            maxY - minY
        ]
    }

    drawImageAnimation() {
        this.clearPhoto();
        if (this.image !== null) {
            this.canvasContext.translate(this.imagePosition.x, this.imagePosition.y);
            this.canvasContext.rotate((this.rotation / 100) * (Math.PI / 2));

            this.canvasContext.drawImage(
                this.image,
                -this.image.width/2,
                -this.image.height/2
            );

            this.canvasContext.resetTransform();
        }

        // Create clipping path
        this.canvasContext.save();
        let region = new Path2D();
        region.rect(0, 0, this.width, this.height);
        const rect = this.getRect();
        if (rect){
            region.rect(...rect);
            this.canvasContext.clip(region, "evenodd");
        }

        // Draw stuff that gets clipped
        this.canvasContext.fillStyle = "rgba(0, 0, 0, 0.8)";
        this.canvasContext.fillRect(0, 0, this.width, this.height);
        this.canvasContext.restore();
        // stop updating.
        if (this.mouseEvent !== MouseMoveEvent.None) {
            requestAnimationFrame((time) => this.drawImageAnimation());
        } 
    }

    beginMoving(event: MouseEvent) {
        // 0 left click
        // 1 middle mouse
        // 2 right click
        if (this.mouseEvent === MouseMoveEvent.None && event.button === 0 && this.image){
            // tell the browser we're handling this mouse event
            // https://stackoverflow.com/questions/28284754/dragging-shapes-using-mouse-after-creating-them-with-html5-canvas

            // set move cursor
            document.body.style.cursor = "move";
 
            this.mouseEvent = MouseMoveEvent.Move;
            this._initalPos = new Point2D(event.x, event.y);
            this._initialImagePosition = new Point2D(this.imagePosition.x, this.imagePosition.y);
            
            event.preventDefault();
            event.stopPropagation();
            // start drawing the image
            this.drawImageAnimation()

        } else if (!this.mouseEvent && event.button === 2) {
            this._initalPos = new Point2D(event.x, event.y);
            this.mouseEvent = MouseMoveEvent.Rect;
            let ratioX = this.canvas.width / this.canvas.clientWidth;
            let ratioY = this.canvas.height / this.canvas.clientHeight;
            this._selRectInitial = new Point2D(event.offsetX * ratioX, event.offsetY * ratioY);
            this._selRectNew = new Point2D(event.offsetX * ratioX, event.offsetY * ratioY);

            document.body.style.cursor = "se-resize";

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            // start drawing the image
            this.drawImageAnimation()
        }
     }
  
     endMoving(event: MouseEvent) {
        if (
            (this.mouseEvent == MouseMoveEvent.Move && event.button === 0) ||
            (this.mouseEvent == MouseMoveEvent.Rect && event.button === 2)
        ) {
            this.mouseEvent = MouseMoveEvent.None;
            
            document.body.style.cursor = "auto";

            event.preventDefault();
            event.stopPropagation();
        }
     }
  
    move(event: MouseEvent) {
        if (this.mouseEvent === MouseMoveEvent.Move && this.image) {
            let relPos = new Point2D(event.x, event.y).sub(this._initalPos);
            relPos.x *= this.canvas.width / this.canvas.clientWidth;
            relPos.y *= this.canvas.height / this.canvas.clientHeight;
            this.imagePosition = this._initialImagePosition.add(relPos);
            
            event.preventDefault();
            event.stopPropagation();
        } else if (this.mouseEvent === MouseMoveEvent.Rect) {
            let relPos = new Point2D(event.x, event.y).sub(this._initalPos);
            relPos.x *= this.canvas.width / this.canvas.clientWidth;
            relPos.y *= this.canvas.height / this.canvas.clientHeight;
            this._selRectNew = (this._selRectInitial as Point2D).add(relPos);

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
        this.canvas.addEventListener("contextmenu", (event) => {event.preventDefault()});
      
        window.addEventListener("mouseup", (event) => this.endMoving(event));
               
        window.addEventListener("mousemove", (event) => this.move(event));

        getElemById<HTMLInputElement>("imgRotation").addEventListener("input", (event) => {
            if (this.mouseEvent === MouseMoveEvent.None) {
                this.mouseEvent = MouseMoveEvent.Rotate;
                // begin draw
                this.drawImageAnimation();
            }
            this.rotation = (event.target as any).value
        })
        getElemById<HTMLInputElement>("imgRotation").addEventListener("change", (event) => {
            this.mouseEvent = MouseMoveEvent.None;
        });
    }

    imgReceived(image: ImageBitmap) {
        this.image = image;
        this.imagePosition = new Point2D(image.width/2, image.height/2);
        this._selRectInitial = Point2D.origin();
        this._selRectNew =  new Point2D(image.width, image.height);
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
        const rect = this.getRect();
        if (rect === null) {
            return Promise.reject("Ajouter une image et selectionner la portion a utiliser.")
        }
        let data = this.canvasContext.getImageData(...rect);
        let img = await createImageBitmap(data);
        // https://stackoverflow.com/questions/52959839/convert-imagebitmap-to-blob
        // i need to draw it to a new canvas
        let tmpCanvas =  document.createElement("canvas");
        tmpCanvas.width = data.width;
        tmpCanvas.height = data.height;
        const ctx = tmpCanvas.getContext("bitmaprenderer");
        if (ctx === null) {
            tmpCanvas.remove();
            return Promise.reject(new Error("Cannot get bitmap context."))
        };
        ctx.transferFromImageBitmap(img);
        let result = await new Promise<Blob | null>((b) => tmpCanvas.toBlob(b, "image/png"));
        if (result === null) {
            tmpCanvas.remove();
            return Promise.reject(new Error("Cannot getting the image data."))
        }
        let filename = "newImage";
        let file = new File([result], filename + ".png", {type: "image/png", lastModified: new Date().getTime()});
        tmpCanvas.remove();
        return file
    }

    async setImageInput() {
        let file = await this.getImageFile();
        let container = new DataTransfer();
        container.items.add(file);
        let elem = getElemById<HTMLInputElement>("image_input");
        elem.files = container.files;
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

function addTag(tagName: string) {
    
    let container = getElemById<HTMLDivElement>("tags-container");
    let chip = document.createElement("span");
    chip.classList.add("mdl-chip")
    chip.classList.add("mdl-chip--deletable")
    let text = document.createElement("span");
    text.classList.add("mdl-chip__text");
    text.innerText = tagName;
    let btn = document.createElement("button");
    btn.type = "button";
    btn.classList.add("mdl-chip__action")
    let image = document.createElement("i");
    image.classList.add("material-icons");
    image.innerText = "cancel";
    btn.addEventListener("click", (event) => {
        chip.remove();
    });
    
    chip.appendChild(text);
    chip.appendChild(btn);
    btn.appendChild(image);
    
    container.appendChild(chip);
}


function getTags() : string[] {
    let out: string[] = [];
    $("#tags-container .mdl-chip__text").each((idx, elem) => {
        out.push(elem.innerText);
    });
    return out;
}


window.addEventListener(
    "load",
    () => {
        if (!showViewLiveResultButton()) {
            let capture = new PhotoCapture;
            capture.clearPhoto();
            capture.init();

            let tagsText = getElemById<HTMLInputElement>("tag-input");
            tagsText.addEventListener("keydown", (event) => {
                if (event.key === 'Enter') {
                    if (tagsText.value) {
                        addTag(tagsText.value);
                        tagsText.value = "";
                    }
                    event.preventDefault();
                }
            });

            let imageInput = getElemById<HTMLInputElement>("image_input_browsed");
            $("#browse_image_input").on("click", (event) => {
                imageInput.click();
            });
            
            imageInput.addEventListener("change", (event) => {
                capture.setImageFromInput();
            });

            $("#accept_new_image").on("click", (event) => {
                capture.setImageInput().then(() => {
                    // handle the tag
                    let tags = getTags().join(';');
                    getElemById<HTMLInputElement>("tags").value = tags;
                    // now that the imge is set trigger the submit
                    // https://api.jquery.com/submit/
                    $("#newimage").trigger("submit");
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
    },
    false
)
