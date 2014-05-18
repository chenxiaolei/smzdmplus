"use strict";
var Request = require("sdk/request").Request;
var self = require("sdk/self");

var SmzdmApiClient = function () {

    var apiUrl = "http://plugin.smzdm.com/api_mobile1/c_index.php";   //api关键地址(不带参数)
    var extensionVersion = self.version;      //扩展版本

    this.getMethodUrl = function (parameters) {
        var queryString = "?";
        for (var parameterName in parameters) {
            queryString += parameterName + "=" + parameters[parameterName] + "&";
        }
        //queryString += "av=f" + extensionVersion;
        var methodUrl = apiUrl + queryString;

        return methodUrl;
    };

    this.request = function (settings) {
        var url = this.getMethodUrl(settings.parameters);
        var verb = "GET";
        url += ((/\?/).test(url) ? "&" : "?") + "f=firefox";

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