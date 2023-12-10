$(() => {
    // loadQueue();
    // last all collection in the file
    $("#images").each((idx, elem) => {
        $.ajax({
            type: "GET",
            url: "/items/read",
            dataType: 'json',
            success: (data) => {
                for (let img of data.thumbnails) {
                    const thumbnailImage = $('<img />')
                        .attr('src', img)
                        .attr('style', "padding: 10px;");
                    elem.appendChild(thumbnailImage.get(0) as HTMLElement);
                }
            },
            error: (data) => {
                console.log("Error: ", data);
            }
        })
    })
    // $().fancybox({
    //     selector: '[data-fancybox="gallery"]',
    //     loop: true,
    //     buttons: ['slideShow', 'fullScreen', 'close'],
    //     image: { preload: true },
    //     transitionEffect: 'fade',
    //     transitionDuration: 1000,
    //     fullScreen: { autoStart: false },
    //     slideShow: { autoStart: true, speed: 3000 },
    //     caption: function (instance, item) {
    //         return $(this).find('figcaption').html();
    //     }
    // });
    // $('#startSlideshow')
    //     .on('click', (e) => $('#images-container a').first().click());
    // $('#logout').on('click', (e) => {
    //     window.location.assign('/logout');
    // });
});