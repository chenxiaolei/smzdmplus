"use strict";
var self = require("sdk/self");
var tabs = require("sdk/tabs");
var ffStorage = require("sdk/simple-storage");
var timers = require("sdk/timers");
var panelSdk = require("sdk/panel")
var notifications = require("sdk/notifications");
var _ = require("sdk/l10n").get;
var pageWorker = require("sdk/page-worker");
var chrome = require("chrome");
var Cc = chrome.Cc;
var Ci = chrome.Ci;
var Cu = chrome.Cu;
var smzdmApi = require("./smzdm.api");
var widgetSdk = require("toolbarwidget");
var userstyles = require("./userstyles");

var attachTo = require("sdk/content/mod").attachTo;
var Style = require("sdk/stylesheet/style").Style;

var Request = require("sdk/request").Request;

/**
 * 全局类 定义
 */
var appGlobal = {
    smzdmWebAddress: "http://www.smzdm.com/?source=ff",
    smzdmApiClient: smzdmApi.getClient(),
    widget: null,
    panel: null,
    intervalIds: [],
    noAppendCachedItems: [],     //未追加到弹出面板的优惠信息
    icons: {     //2个图标,现在都一样,保留接口,后面一个用于登陆前和一个登录后的
        default: "images/icon20.png",
        inactive: "images/icon20.png"
    },
    clickActions: {
        get showPopup() {
            return 0;
        },
        get openSite() {
            return 1;
        },
        get update() {
            return 2;
        },
        get resetItems() {
            return 3;
        },
        get none() {
            return 4;
        }
    },
    options: {
        leftClick: 0,
        rightClick: 1,
        middleClick: 2,

        maxAppendedItemsSize: 200,
        showDesktopNotifications: true,    //是否将显示系统级提示菜单显示(推送)优惠信息
        allowNotificationsPlaySound: true,    //是否有推送时,声音提示

        _updateInterval: 15000,    //调度间隔(毫秒)
        get updateInterval() {
            var minimumInterval = 10000; //最小调度间隔(毫秒)
            return this._updateInterval >= minimumInterval ? this._updateInterval : minimumInterval;
        }
    },
    //Firefox sdk 目前不支持一次弹出多个提示框 ,所以这里只能是1,以后看有无可能等sdk升级后 增加这个
    maxNotificationsCount: 1,
    maxTabNotifierExtensionNotificationsCount: 4
};

/**
 * 加载完成后执行
 */
(function () {
    userstyles.load(self.data.url("styles/button.css"));    //加载button.css
    initialize();   //初始化
})();


/**
 * 插件初始化
 */
function initialize() {
    //开始插件控件初始化
    controlsInitialization();
    startSchedule(appGlobal.options.updateInterval);  //启用调度器
}

/**
 * 启动调度器
 */
function startSchedule(updateInterval) {
    stopSchedule();
    if (appGlobal.options.showDesktopNotifications) {
        appGlobal.intervalIds.push(timers.setInterval(function () {
            console.info("startSchedule**********************************startSchedule");
            updateItems(function(){
                prepareItemsAndSendItemsToPopup({items: appGlobal.noAppendCachedItems.splice(0)});
            });
        }, updateInterval));
    }
}

/**
 * 停止调度器
 */
function stopSchedule() {
    appGlobal.intervalIds.forEach(function (intervalId) {
        timers.clearInterval(intervalId);
    });
    appGlobal.intervalIds = [];
}

/**
 * 插件的控件初始化
 * @param showPanel
 */
function controlsInitialization() {
    if (appGlobal.panel) {
        appGlobal.panel.destroy();
    }

    if (appGlobal.widget) {
        appGlobal.widget.destroy();
    }

    //初始化弹出面板
    appGlobal.panel = panelSdk.Panel({
        width: 500,   //宽度,高度和官方chrome版保持一致
        height: 600,
        contentURL: self.data.url("popup.html"),
        contentScriptFile: [
            self.data.url("scripts/jquery-2.0.3.min.js"),
            self.data.url("scripts/jquery.mustache.min.js"),
            self.data.url("scripts/timeago/jquery.timeago.js"),
            self.data.url("scripts/timeago/locales/jquery.timeago.zh-CN.js"),
            self.data.url("scripts/popup.js")
        ]
    });

    //从持久化缓存中 拿出之前的优惠信息,将其加载到弹出面板中.
    sendItemsToPopup({items: ffStorage.storage && ffStorage.storage.appendedItems ? ffStorage.storage.appendedItems : []});

    //注册下,显示面板时,执行reloadPanel();
    appGlobal.panel.on("show", reloadPanel);
    appGlobal.panel.on("hide", clearNoreadNewImage);

    appGlobal.panel.port.on("openTab", function (data) {
        openTab(data.url);
    });

    appGlobal.panel.port.on("resetItemsReaded", function () {
        resetItemsReaded();
    });



    //初始化工具栏组件(插件图标)
    appGlobal.widget = widgetSdk.ToolbarWidget({
        toolbarID: "nav-bar",
        insertbefore: [ "search-container", "downloads-button", "home-button" ],
        forceMove: false,
        height: 20,
        width: 28,
        id: "main-widget",
        label: "什么值得买实时推送",
        tooltip: "什么值得买 实时推送 网友无聊自制版",
        contentURL: self.data.url("widget.html"),
        contentScriptFile: self.data.url("scripts/widget.js"),
        panel: appGlobal.panel,
        autoShrink: false
    });

    //从持久化缓存中 拿出之前的未读计数,将其加载到工具栏图标组件上.
    sendUnreadItemsCount(ffStorage.storage && ffStorage.storage.unreadItemsCount ? ffStorage.storage.unreadItemsCount : 0);

    /**
     * 注册下 鼠标事件 ,widget.js 中会调用
     */
    appGlobal.widget.port.on("middle-click", function () {
        executeClickAction(appGlobal.options.middleClick);
    });

    appGlobal.widget.port.on("left-click", function () {
        executeClickAction(appGlobal.options.leftClick);
    });

    appGlobal.widget.port.on("right-click", function () {
        executeClickAction(appGlobal.options.rightClick);
    });

    appGlobal.panel.port.on("deleteAllItem", function (data) {
        executeClickAction(appGlobal.clickActions.resetItems);
    });

    function executeClickAction(action) {
        switch (action) {
            case appGlobal.clickActions.showPopup:
                resetCounter();
                break;
            case appGlobal.clickActions.openSite:
                openSite();
                break;
            case appGlobal.clickActions.update:
                update();
                break;
            case appGlobal.clickActions.resetItems:
                clearItems();
                break;
            case appGlobal.clickActions.none:
                break;
        }

        /**
         * 打开官方首页
         */
        function openSite() {
            openTab(appGlobal.smzdmWebAddress);
        }

        /**
         * 更新数据,保留接口未实现
         */
        function update() {

        }

        /**
         * 重置计数器
         */
        function resetCounter() {
            ffStorage.storage.unreadItemsCount = 0;
            sendUnreadItemsCount(0);
        }

        function clearItems() {
            ffStorage.storage.appendedItems = [];
        }
    }

    timers.setTimeout(function(){
        getItems(prepareItemsAndSendItemsToPopup);
    }, 3000);
    //reloadPanel();
}


/**
 * 判断是否当前ff安装了TabNotifier扩展
 */
function isTabNotifierExtensionLoaded() {
    try {
        Cu.import("chrome://tabnotifier/content/tabNotifierHelper.jsm");
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * 重置面板
 * 将优惠信息加载到面板中(如果有新的信息)
 *      暂时意义不大,本来是想打开面板时再刷上去,但是如果接收推送后,直接关闭浏览器会导致推送的消息丢失
 *      现在是调度中startSchedule(),只要获取到了推送,就直接刷到面板上去
 *      暂时保留此逻辑
 */
function reloadPanel() {
    //console.info("reloadPanel------------------------------------");
    //获取优惠信息,回调函数参数data未最新的优惠信息
    getItems(prepareItemsAndSendItemsToPopup);
}
function clearNoreadNewImage(){
    console.info("panel close->>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
    appGlobal.panel.port.emit("clearNoreadNewImage");
}

function prepareItemsAndSendItemsToPopup(data) {
    console.info("prepareItemsAndSendItemsToPopup dataLength------------------------------------", data.items.length);
    if(data){
        if (data.items.length > 0) {
            //将未追加到弹出面板的优惠信息清空(因为马上就会将其内容追加到面板中)  data.items是appGlobal.noAppendCachedItems的复制体
            appGlobal.noAppendCachedItems = [];

            //更新下 已追加更新到面板的优惠记录 缓存
            var appendedItems = ffStorage.storage && ffStorage.storage.appendedItems ? ffStorage.storage.appendedItems : [];
            ffStorage.storage.appendedItems = data.items.concat(appendedItems);

            //如果已追加更新到面板的优惠记录总数 大于 允许的最大数目,就将时间最早的多余条删除掉
            if (appendedItems.length > appGlobal.options.maxAppendedItemsSize) {
                var delItems = appendedItems.splice(appGlobal.options.maxAppendedItemsSize);  //准备删除的
                //删除面板中的
                deleteItemsFromPopup(delItems);
                //删除缓存中的
                ffStorage.storage.appendedItems = appendedItems.splice(0, appGlobal.options.maxAppendedItemsSize);
            }
            //将未追加到弹出面板的优惠信息追加到面板中
            sendItemsToPopup(data);
        }
    }
}

function resetItemsReaded(){
    if(ffStorage.storage && ffStorage.storage.appendedItems){
        for(var i=0;i<ffStorage.storage.appendedItems.length;i++ ){
            ffStorage.storage.appendedItems[i]["noread"]=false;
        }
    }
}

/**
 * 获取优惠信息
 */
function getItems(callback) {
    //console.info("getItems noAppendCachedItems length------------------------------------", appGlobal.noAppendCachedItems.length);
    //如果未加载缓存优惠信息队列不是空队列,就直接用未加载缓存优惠信息队列,将其加载到面板上
    if (appGlobal.noAppendCachedItems.length > 0) {
        callback({items: appGlobal.noAppendCachedItems.splice(0)});
    } else {
        //否则直接请求smzdm拿最新的推送信息,将其加载到面板上
        updateItems(function () {
            callback({items: appGlobal.noAppendCachedItems.splice(0)});
        }, true);
    }
}

/**
 * 新标签打开方法
 */
function openTab(url) {
    tabs.open({
        url: url
    });
}


/**
 * 更新商品优惠信息
 * @param callback
 */
function updateItems(callback) {
    //console.info("ffStorage.storage.lasttime || ------------------------------------", ffStorage.storage.lasttime || "");
    apiRequestWrapper({
        parameters: {
            lasttime: ffStorage.storage && ffStorage.storage.lasttime != null ? ffStorage.storage.lasttime : "1",
            mod: "get_post_twenty"
        },
        onSuccess: function (response) {
            console.info("get items is error------------------------------------", response["error"]);
            if (response["error"] == 0) {
                var data = response["data"];
                if (data && data.length > 0) {
                    var num = data["length"];

                    console.info("current get items length------------------------------------", num);
                    //将此次获取到的优惠信息 都加到 未追加面板优惠信息队列中
                    appGlobal.noAppendCachedItems = appGlobal.noAppendCachedItems.concat(data);

                    //过滤下
                    var appendItems = ffStorage.storage && ffStorage.storage.appendedItems ? ffStorage.storage.appendedItems : []
                    appGlobal.noAppendCachedItems = appGlobal.noAppendCachedItems.filter(function (value, index, items) {
                        //noAppendCachedItems重复的内容,剔除
                        for (var i = ++index; i < items.length; i++) {
                            if (items[i]["msg_id"] == value["msg_id"]) {
                                return false;
                            }
                        }
                        //看是否和已加载到弹出面板的优惠信息(ffStorage.storage.appendedItems)是否存在重复的内容,如果有就剔除
                        for (var i = 0; i < appendItems.length; i++) {
                            if (appendItems[i]["msg_id"] == value["msg_id"]) {
                                return false;    //剔除
                            }
                        }
                        //额,顺路把未读标识加上
                        value["noread"]=true;
                        //额,顺路把优惠信息的标题内容中的正标题和副标题 区分出来
                        var titleSplitArr = value["msg_title"].split("　");
                        if (titleSplitArr.length == 2) {
                            value["tran_title1"] = titleSplitArr[0];
                            value["tran_title2"] = titleSplitArr[1];
                        } else {
                            value["tran_title1"] = value["msg_title"];
                            value["tran_title2"] = "";
                        }
                        return true;
                    });

                    //排下序,时间最近的排前面
                    appGlobal.noAppendCachedItems = appGlobal.noAppendCachedItems.sort(function (a, b) {
                        return  b["msg_date"] - a["msg_date"];
                    });

                    //取时间最近的一个,做为下次抓取的lasttime条件(持久化)
                    ffStorage.storage.lasttime = appGlobal.noAppendCachedItems[0]["msg_date"];

                    //持久化下 未读数量
                    ffStorage.storage.unreadItemsCount =
                            ffStorage.storage && ffStorage.storage.unreadItemsCount ? ffStorage.storage.unreadItemsCount + appGlobal.noAppendCachedItems.length : appGlobal.noAppendCachedItems.length;

                    console.info("update unread------------------------------------", ffStorage.storage.unreadItemsCount);
                    console.info("final get items length------------------------------------", appGlobal.noAppendCachedItems.length);

                    //更新图标上的计数器
                    sendUnreadItemsCount(ffStorage.storage.unreadItemsCount);
                    //如果未追加面板优惠信息队列不为空, 并且允许弹出系统桌面提示
                    if (appGlobal.noAppendCachedItems.length > 0 && appGlobal.options.showDesktopNotifications) {
                        sendDesktopNotification(appGlobal.noAppendCachedItems);  //弹出提系统桌面提示
                        //播放声音
                        if (appGlobal.options.allowNotificationsPlaySound) {
                            playSound();
                        }
                    }


                }
            }
            if (typeof callback === "function") {
                callback();
            }
        }
    });
}


/**
 * 更新面板优惠信息,调用popub.js中的itemsUpdated方法
 */
function sendItemsToPopup(itemsData) {
    appGlobal.panel.port.emit("itemsUpdated", itemsData);
}
/**
 * 更新计数器 调用widget.js中的onItemsUpdate 方法;
 */
function sendUnreadItemsCount(unreadNum) {
    appGlobal.widget.port.emit("onItemsUpdate", unreadNum);
}
/**
 * 删除面板优惠信息
 * @param itemsData
 */
function deleteItemsFromPopup(items) {
    appGlobal.panel.port.emit("itemsDeleted", items);
}


/**
 * 发送到桌面弹出提示框
 * @param items
 */
function sendDesktopNotification(items) {
    //如果装了tabnotifier,就用基于tabnotifier的提示,否则用ff自带的
    if (isTabNotifierExtensionLoaded()) {
        var tnHelper = TabNotifier.helper;
        var settings = tnHelper.getDefaultSettings();

        //如果一次推送提示太多,舍去推送不大于appGlobal.maxTabNotifierExtensionNotificationsCount的条数
        for (var i = (items.length > appGlobal.maxTabNotifierExtensionNotificationsCount ? appGlobal.maxTabNotifierExtensionNotificationsCount : items.length) - 1;
             i >= 0; i--) {
            var uid = tnHelper.generateUid();
            var not = {
                iconUrl: items[i]["msg_picurl"],
                document: {location: {host: '什么值得买无聊自制版', href: 'about:blank'}},
                title: items[i]["msg_title"],
                body: items[i]["msg_desc"],
                __tabNotifierData: {settings: settings},
                closeTime: settings[3] == 2 ? settings[5] * 1000 : 0,
                uid: uid,
                winUid: uid,
                data: items[i],
                onclick: function () {
                    openTab(this.data["msg_url"]);
                }
            };
            tnHelper.pushNotification(not);


            /*var tnHelper = TabNotifier.helper;

             var windows=tnHelper.getNotificationWindows();
             console.info("llllllllllllllll------------"+tnHelper.getNotificationWindows());

             var style = Style({
             source: "window[size='normal'] #tabnotifier_textBox {height:8.75em;}"
             });
             for(var temp in windows){
             console.info("hhhhhhhh------------"+temp);
             attachTo(style, windows[temp]);
             }*/
            // attachTo(style, temp);
        }
    } else {
        //firefox 目前不支持一次弹出多个 无奈,如果一次推送收到多条 就合并一条,显示收到总数
        if (items.length > appGlobal.maxNotificationsCount) {
            var count = items.length.toString();
            notifications.notify({
                title: "smzdm.com 实时推送",
                text: "有新的" + count + "条优惠信息",
                iconURL: self.data.url(appGlobal.icons.default),
                onClick: function () {
                    openTab({url: appGlobal.smzdmWebAddress});
                }
            });
        } else {
            for (var i = (items.length > appGlobal.maxTabNotifierExtensionNotificationsCount ? appGlobal.maxTabNotifierExtensionNotificationsCount : items.length) - 1;
                 i >= 0; i--) {
                notifications.notify({
                    title: items[i]["msg_title"],
                    text: items[i]["msg_desc"],
                    iconURL: items[i]["msg_picurl"],
                    data: JSON.stringify(items[i]),
                    onClick: function (item) {
                        item = JSON.parse(item);
                        openTab(item["msg_url"]);
                    }
                });
            }
        }
    }

    /*var alertsService =
     Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
     var title = "test"+items;
     var message = "test"+items;

     alertsService.showAlertNotification(
     "chrome://xulschoolhello/skin/hello-notification.png",
     title, message, true, "", this, "XULSchool Hello Message");*/

    //console.info("++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++");
}

/**
 * 播放声音(当有新的优惠商品信息时)
 */
function playSound() {
    pageWorker.Page({
        contentScript: "new Audio('sound/alert.oga').play()",
        contentURL: self.data.url("blank.html")
    });
}


/**
 * 调用封装的request get请求
 * @param settings
 */
function apiRequestWrapper(settings) {
    appGlobal.smzdmApiClient.request(settings);
}

/**
 *
 * @param options
 */
exports.main = function (options) {
}

/**
 *
 * @param reason
 */
exports.onUnload = function (reason) {
    if (reason == "shutdown") {
        if (isTabNotifierExtensionLoaded()) {
            TabNotifier.helper.cancelAllNotifications();
        }
    }
};



