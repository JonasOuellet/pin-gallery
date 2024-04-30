function showDialog(title: string, content: string) {
    let dialog = document.querySelector("#simplemsgdialog") as HTMLDialogElement;
    (dialog.querySelector("h2") as HTMLHeadElement).innerText = title;
    (dialog.querySelector("p") as HTMLParagraphElement).innerText = content;
    (dialog.querySelector("button") as HTMLButtonElement).onclick = () => {
        dialog.close();
    }
    dialog.showModal();
}