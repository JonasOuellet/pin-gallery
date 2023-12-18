$(() => {
    $("#undeploy").on("click", (handler) => {
        $.ajax({
            url: '/undeployindex',
            method: 'GET',
            success: (data) => {
                $("#undeploy").remove();
                $("#processbar").css("visibility", "visible");
                $('#process').append($("<p />").text("Annulation du deploiement..."));
            },
            error: (xhr, status, error) => {
                $("#process").append($("<p />").text(`Une erreur est survenue: ${error}`));
            }
        })
    });
    $("#deploy").on("click", (handler) => {
        $.ajax({
            url: '/deployindex',
            method: 'GET',
            success: (data) => {
                $("#deploy").remove();
                $("#processbar").css("visibility", "visible");
                $('#process').append($("<p />").text("Deploiement de l'index..."));
            },
            error: (xhr, status, error) => {
                $("#process").append($("<p />").text(`Une erreur est survenue: ${error}`));
            }
        })
    });
});