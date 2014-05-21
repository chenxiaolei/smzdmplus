"use strict";


var settingContent = $("#setting-container");

settingContent.on("click", "#playSoundBtn", function (event) {
    self.port.emit("playSound", null);
    event && event.preventDefault && event.preventDefault();
    return false;
});

settingContent.on("click", "#testNotifyBtn", function (event) {
    self.port.emit("testNotifyBtn", null);
    event && event.preventDefault && event.preventDefault();
    return false;
});


settingContent.on("click", "#addTestData", function (event) {
    self.port.emit("addTestData", null);
    event && event.preventDefault && event.preventDefault();
    return false;
});



settingContent.on("change", 'input[name="allowNotify"],input[name="allowPlaySound"],#maxAppendedItemsSize,#allowItemArea,#keywordInclud', function () {
    var val= $.isNumeric($(this).val())? parseInt($(this).val()):$(this).val();
    var prefData={
        name:$(this).attr("pref"),
        value: val
    }
    console.info('setting change--------------------------------------------------------------------------------------------', $(this).attr("pref"), "=", val);
    self.port.emit("storePref", prefData);
});

settingContent.on("change", '#keywordInclud', function () {
    var val=$(this).val().toString().trim();
    var prefData={
        name:$(this).attr("pref"),
        value: val.trim()
    }
    console.info('setting change--------------------------------------------------------------------------------------------', $(this).attr("pref"), "=", val);
    self.port.emit("storePref", prefData);
});

settingContent.on("change", 'input[name="cats-filter"]', function () {
    var catIdArr=[];
    $('input[name="cats-filter"]:checked',settingContent).each(function () {
        var val= $.isNumeric($(this).val())? parseInt($(this).val()):$(this).val();
        catIdArr.push(val);
    })
    var prefData={
        name:$(this).attr("pref"),
        value: catIdArr
    }
    console.info('setting change--------------------------------------------------------------------------------------------', $(this).attr("pref"), "=",  catIdArr);
    self.port.emit("storePref", prefData);

});


self.port.on("getCats", function (cats1,cats2) {
    if (cats1.length) {
        for (var i = 0; i < cats1.length; i += 6) {
            var row = $('<div class="row"></div>');
            row.append($("#cats-template").mustache({cats: cats1.slice(i, i + 6)}));
            $("#priceCat-body").append(row);
        }
    }
    if (cats2.length) {
        for (var i = 0; i < cats2.length; i += 6) {
            var row = $('<div class="row"></div>');
            row.append($("#cats-template").mustache({cats: cats2.slice(i, i + 6)}));
            $("#itemCat-body").append(row);
        }
    }
    self.port.emit("getSetting", null);
});

self.port.on("returnSetting", function(settingOptions){
    $("#maxAppendedItemsSize").val(settingOptions["maxAppendedItemsSize"]);
    $("#allowItemArea").val(settingOptions["allowItemArea"]);
    $("#keywordInclud").val(settingOptions["keywordInclud"]);

    /*$("#leftClick").val(settingOptions["leftClick"]);
    $("#middleClick").val(settingOptions["middleClick"]);
    $("#rightClick").val(settingOptions["rightClick"]);*/

    $('input[name="allowNotify"][value="'+(settingOptions["showDesktopNotifications"]?1:0)+'"]').attr("checked",true);
    $('input[name="allowPlaySound"][value="'+(settingOptions["allowNotificationsPlaySound"]?1:0)+'"]').attr("checked",true);

    var cats = settingOptions["catsFilters"] ? settingOptions["catsFilters"]: [];
    if(cats.length==0){
       $('input[name="cats-filter"]').attr("checked",true);
    }else{
        for(var i=0;i<cats.length;i++){
            $('#cat-'+cats[i]).attr("checked",true);
        }
    }


});











