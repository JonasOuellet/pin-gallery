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
    photo: HTMLImageElement;
    startBtn: HTMLButtonElement;

    constructor() {
        this.width = 320;
        this.height = null;

        this.streaming = false;

        this.video = getElemById<HTMLVideoElement>("video");
        this.canvas = getElemById<HTMLCanvasElement>("canvas");
        this.photo = getElemById<HTMLImageElement>("photo");
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
            
            const data = this.canvas.toDataURL("image/png");
            this.photo.setAttribute("src", data);
        } else {
            this.clearPhoto();
        }
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
        this.photo.setAttribute("src", data);
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


window.addEventListener(
    "load",
    () => {
        if (!showViewLiveResultButton()) {
            let capture = new PhotoCapture;
            capture.clearPhoto();
            capture.initVideoStream();
        }
    },
    false
)