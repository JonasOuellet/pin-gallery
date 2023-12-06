// "use strict";
// function clearPreview() {
//     showPreview(null, null);
// }
// function showPreview(source, mediaItems) {
//     $('#images-container').empty();
//     if (source && mediaItems) {
//         $('#images-count').text(mediaItems.length);
//         $('#images-source').text(JSON.stringify(source));
//         $('#preview-description').show();
//     }
//     else {
//         $('#images-count').text(0);
//         $('#images-source').text('No photo search selected');
//         $('#preview-description').hide();
//     }
//     if (!mediaItems || !mediaItems.length) {
//         $('#images_empty').show();
//         $('#startSlideshow').prop('disabled', true);
//     }
//     else {
//         $('#images_empty').hide();
//         $('startSlideshow').removeClass('disabled');
//     }
//     $.each(mediaItems, (i, item) => {
//         const thumbnailUrl = `${item.baseUrl}=w256-h256`;
//         const fullUrl = `${item.baseUrl}=w${item.mediaMetadata.width}-h${item.mediaMetadata.height}`;
//         const description = item.description ? item.description : '';
//         const model = item.mediaMetadata.photo.cameraModel ?
//             `#Shot on ${item.mediaMetadata.photo.cameraModel}` :
//             '';
//         const time = item.mediaMetadata.creationTime;
//         const captionText = `${description} ${model} (${time})`;
//         const linkToFullImage = $('<a />')
//             .attr('href', fullUrl)
//             .attr('data-fancybox', 'gallery')
//             .attr('data-width', item.mediaMetadata.width)
//             .attr('data-height', item.mediaMetadata.height);
//         const thumbnailImage = $('<img />')
//             .attr('src', thumbnailUrl)
//             .attr('alt', captionText)
//             .addClass('img-fluid rounded thumbnail');
//         linkToFullImage.append(thumbnailImage);
//         const imageCaption = $('<figcaption />').addClass('hidden').text(captionText);
//         const linkToGooglePhotos = $('<a />')
//             .attr('href', item.productUrl)
//             .text('[Click to open in Google Photos]');
//         imageCaption.append($('<br />'));
//         imageCaption.append(linkToGooglePhotos);
//         linkToFullImage.append(imageCaption);
//         $('#images-container').append(linkToFullImage);
//     });
// }
// ;
// function loadQueue() {
//     showLoadingDialog();
//     $.ajax({
//         type: 'GET',
//         url: '/getQueue',
//         dataType: 'json',
//         success: (data) => {
//             hideLoadingDialog();
//             showPreview(data.parameters, data.photos);
//             hideLoadingDialog();
//             console.log('Loaded queue.');
//         },
//         error: (data) => {
//             hideLoadingDialog();
//             handleError('Could not load queue', data);
//         }
//     });
// }


$(() => {
    // loadQueue();
    // last all collection in the file
    $(".collection-container").each((idx, elem) => {
        let colName = (elem.children[0] as HTMLElement).innerText;
        $.ajax({
            type: "GET",
            url: `/collections/${colName}/itemimages/read`,
            dataType: 'json',
            success: (data) => {
                let container = elem.children[2] as HTMLDivElement;
                for (let img of data.thumbnails) {
                    const thumbnailImage = $('<img />')
                        .attr('src', img + "=w128-h128")
                        .attr('style', "padding: 10px;");
                    container.appendChild(thumbnailImage.get(0) as HTMLElement);
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