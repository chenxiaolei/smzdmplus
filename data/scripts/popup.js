"use strict";

var popupContent = $("#popup-content");

popupContent.on("click", "#register,#baoliao,#website,#viewMoreItems,.item-actions a,#popup-body .item-image a,#popup-body .item-title a", openTab);
popupContent.on("click", "#deleteAllItem", function(event){
    deleteItems();
    self.port.emit("deleteAllItem");
    event && event.preventDefault && event.preventDefault();
    return false;
});
popupContent.on("click", "#setting-btn", function(event){
    self.port.emit("openSettingTab");
    event && event.preventDefault && event.preventDefault();
    return false;
});



/**
 * 新开标签页打开 调用main.js中的openTab方法
 */
function openTab() {
    var ele = $(this);
    //用扩展的新标签方法打开url
    self.port.emit("openTab", {url: ele.attr("data")});
}


function deleteItems(items){
    if(items){
        var container= $("#items");
        for (var i = 0; i < items.length; i++) {
            container.find(".item[data-id='" + items[i]["msg_id"] + "']").fadeOut("fast", function () {
                $(this).remove();
            });
        }
    }else{
        $("#items").empty();
    }
}


function renderItems(data) {
    console.info("renderItems data length------------------------------------",data.items.length);
    if (data.items.length > 0) {
        var container= $("#items");
        container.prepend($("#item-template").mustache({items: data.items}));
        container.find(".timeago").timeago();
    }

    self.port.emit("resetItemsReaded");
    backToTop();
}

function clearNoreadNewImage(){
    var container= $("#items");
    container.find(".item-no-read").removeClass("item-no-read");
}

self.port.on("clearNoreadNewImage", function () {
    clearNoreadNewImage();
});


self.port.on("itemsUpdated", function (itemsData) {
    renderItems(itemsData);
});

self.port.on("itemsDeleted", function (items) {
    deleteItems(items);
});


self.port.on("backToTop", function (items) {
    backToTop();
});

function backToTop(){
    $("#popup-body").scrollTop(0);
}