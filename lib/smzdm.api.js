"use strict";
var Request = require("sdk/request").Request;
var self = require("sdk/self");

var SmzdmApiClient = function () {

    //var apiUrl = "http://plugin.smzdm.com/api_mobile1/c_index.php";   //api关键地址(不带参数)
    var apiUrl = "http://plugin.smzdm.com/plugin/api/mobile/v5/c_index.php";   //api关键地址2(不带参数)
    var apiUrl2 = "http://plugin.smzdm.com/plugin/api/mobile/v5/c_index.php";   //api关键地址2(不带参数)
    var extensionVersion = self.version;      //扩展版本

    //http://plugin.smzdm.com/api_mobile1/c_index.php?lasttime=1400569339&mod=get_post_twenty&f=firefox  推送信息

    //http://plugin.smzdm.com/plugin/api/mobile/v5/c_index.php?f=browser&version=j2.4&&mod=get_cls 获取商品类型    鞋帽,家电
    //http://plugin.smzdm.com/plugin/api/mobile/v5/c_index.php?f=browser&version=j2.4&mod=get_defcls 获取价值商品类型  手慢无,白菜党
    this.getMethodUrl = function (parameters) {
        var queryString = "?";
        for (var parameterName in parameters) {
            queryString += parameterName + "=" + parameters[parameterName] + "&";
        }

        if(!(parameters && parameters["f"])){
            queryString += "f=firefox";
        }
        var url=apiUrl;
        if( parameters && parameters["useApiUrlIndex"] && parameters["useApiUrlIndex"]==2){
            url=apiUrl2;
        }
        var methodUrl = url + queryString;

        return methodUrl;
    };

    this.request = function (settings) {
        var url = this.getMethodUrl(settings.parameters);
        var verb = "GET";
        /*url += ((/\?/).test(url) ? "&" : "?") + "f=firefox";*/

        /* Firefox addon SDK support native XMLHttpRequest with limitations*/
        console.info(url);
        var request = Request({
            url: url,
            onComplete: function (response) {
                if (response.status === 200) {
                    if (typeof settings.onSuccess === "function") {
                        settings.onSuccess(response.json);
                    }
                }  else if (response.status === 400) {
                    if (typeof settings.onError === "function") {
                        settings.onError(response.json);
                    }
                }
                if (typeof settings.onComplete === "function") {
                    settings.onComplete();
                }
            }
        });
        request.get();

    };
};

function getClient() {
    return new SmzdmApiClient();
}

exports.getClient = getClient;