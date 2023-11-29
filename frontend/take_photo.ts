function getElemById<T>(id: string): T {
    let elem = document.getElementById(id);
    if (elem === null) {
        throw new Error(`Couldn't find element with id: ${id}`)
    }
    return elem as T;
}


class PhotoCapture {
    width: number;
    height: number | null;

    // |streaming| indicates whether or not we're currently streaming
    // video from the camera. Obviously, we start at false.
    stream: MediaStream | null;
    streaming: boolean;

    video: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    // photo: HTMLImageElement;
    startBtn: HTMLButtonElement;

    constructor() {
        this.width = 320;
        this.height = null;

        this.streaming = false;

        this.video = getElemById<HTMLVideoElement>("video");
        this.canvas = getElemById<HTMLCanvasElement>("canvas");
        // this.photo = getElemById<HTMLImageElement>("photo");
        this.startBtn = getElemById<HTMLButtonElement>("startbutton");

        this.stream = null;
    }

    initVideoStream() {
        navigator.mediaDevices
            .getUserMedia({ video: true, audio: false })
            .then((stream) => {
                this.stream = stream;
                this.video.srcObject = stream;
                this.video.play();
                this.initCallbacks();
            })
            .catch((err) => {
                console.error(`Couldn't find camera: ${err}`);
            });
    }

    initCallbacks() {
        this.video.addEventListener(
            "canplay",
            (ev) => {
                if (!this.streaming) {
                    this.height = this.video.videoHeight / (this.video.videoWidth / this.width);

                    // Firefox currently has a bug where the height can't be read from
                    // the video, so we will make assumptions if this happens.

                    if (isNaN(this.height)) {
                        this.height = this.width / (4 / 3);
                    }

                    this.video.setAttribute("width", this.width.toString());
                    this.video.setAttribute("height", this.height.toString());
                    this.canvas.setAttribute("width", this.width.toString());
                    this.canvas.setAttribute("height", this.height.toString());
                    this.streaming = true;
                }
            },
            false,
        );

        this.startBtn.addEventListener(
            "click",
            (ev) => {
                this.takePicture();
                ev.preventDefault();
            },
            false,
        );
    }

    // Capture a photo by fetching the current contents of the video
    // and drawing it into a canvas, then converting that to a PNG
    // format data URL. By drawing it on an offscreen canvas and then
    // drawing that to the screen, we can change its size and/or apply
    // other changes before drawing it.
    takePicture() {
        const context = this.canvas.getContext("2d");
        if (context === null) {
            throw new Error("Cannot get context from canvas.");
        }
        if (this.width && this.height) {
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            context.drawImage(this.video, 0, 0, this.width, this.height);
            
        } else {
            this.clearPhoto();
        }
    }
    
    setImageFromInput() {
        const context = this.canvas.getContext("2d");
        if (context === null) {
            throw new Error("Cannot get context from canvas.");
        }
        if (this.width && this.height) {
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            let input = getElemById<HTMLInputElement>("image_input_browsed");
            if (input.files !== null) {
                let file = input.files[0];
                var url = URL.createObjectURL(file);
                var img = new Image();
                img.onload = function() {
                    context.drawImage(img, 0, 0, img.width, img.height);
                    // clear the file
                    let container = new DataTransfer();
                    input.files = container.files;
                }
                img.src = url;
            }
        }    
        this.clearPhoto();
        
    }

    setImageInput(callback: (succeded: boolean) => any) {
        // https://stackoverflow.com/questions/23511792/attach-a-blob-to-an-input-of-type-file-in-a-form
        this.canvas.toBlob(
            (result: Blob | null) => {
                if (result === null) {
                    // handle error here.
                    return callback(false);
                }
                let filename = crypto.randomUUID();
                let file = new File([result], filename + ".png", {type: "image/png", lastModified: new Date().getTime()});
                let container = new DataTransfer();
                container.items.add(file);
                let elem = getElemById<HTMLInputElement>("image_input");
                elem.files = container.files;
                return callback(true);
            },
            // need to also test jpeg.  which one is smaller.
            "image/png",
            // the quality for jpeg image
            1 
        );
    }

    // Fill the photo with an indication that none has been
    // captured.
    clearPhoto() {
        const context = this.canvas.getContext("2d");
        if (context === null) {
            throw new Error("Cannot get context from canvas.");
        }
        context.fillStyle = "#AAA";
        context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const data = this.canvas.toDataURL("image/png");
        // this.photo.setAttribute("src", data);
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
            capture.initVideoStream();

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
                capture.setImageInput((succeded: boolean) => {
                    if (succeded) {
                        // handle the tag
                        let tags = getTags().join(';');
                        getElemById<HTMLInputElement>("tags").value = tags;
                        // now that the imge is set trigger the submit
                        // https://api.jquery.com/submit/
                        $("#newimage").trigger("submit");
                    } else {
                        throw new Error("Coudln't send new item.  Failed to send image.")
                    }
                });
            });
        }

    },
    false
)