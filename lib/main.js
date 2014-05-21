"use strict";
var self = require("sdk/self");
var tabs = require("sdk/tabs");
var ffStorage = require("sdk/simple-storage");
var timers = require("sdk/timers");
var panelSdk = require("sdk/panel");
var options = require("sdk/simple-prefs");
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
    smzdmClientVersionStr:"smzdmffplus-0.2",
    smzdmWebAddress: "http://www.smzdm.com/?source=ff",
    smzdmApiClient: smzdmApi.getClient(),
    widget: null,
    panel: null,
    intervalIds: [],
    noAppendCachedItems: [],     //未追加到弹出面板的优惠信息
    settingTab: null,

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
        middleClick: 4,

        maxAppendedItemsSize: 50,          //最新信息保留条数
        showDesktopNotifications: 1,    //是否将显示系统级提示菜单显示(推送)优惠信息 1 是true  0 是false
        allowNotificationsPlaySound: 1,    //是否有推送时,声音提示 1 是true  0 是false
        allowItemArea:0,                    //允许商品范围, 0 全部 1国内 2国外

        catsFilters:[],                     //推送分类过滤
        keywordInclud:"",                   //关键字包含 为空不进行判断

        _updateInterval: 15000,    //调度间隔(毫秒)
        get updateInterval() {
            var minimumInterval = 10000; //最小调度间隔(毫秒)
            return this._updateInterval >= minimumInterval ? this._updateInterval : minimumInterval;
        },
        set updateInterval(value) {
            return this._updateInterval = value;
        }
    },
    //Firefox sdk 目前不支持一次弹出多个提示框 ,所以这里只能是1,以后看有无可能等sdk升级后 增加这个
    maxNotificationsCount: 1,
    maxTabNotifierExtensionNotificationsCount: 4,

    testIndex:1
};

/**
 * 加载完成后执行
 */
(function () {
    userstyles.load(self.data.url("styles/button.css"));    //加载button.css

    options.on("setting", function () {
        openSettingTab();
    });
})();


/**
 * 插件初始化
 */
function initialize() {
    //开始插件控件初始化
    controlsInitialization();
    //startSchedule(appGlobal.options.updateInterval);  //启用调度器
}

/**
 * 启动调度器
 */
function startSchedule(updateInterval) {
    stopSchedule();
    appGlobal.intervalIds.push(timers.setInterval(function () {
        console.info("startSchedule**********************************startSchedule");
        updateItems(function(){
            prepareItemsAndSendItemsToPopup({items: appGlobal.noAppendCachedItems.slice(0)});
        });
    }, updateInterval));
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

    appGlobal.panel.port.on("openSettingTab", function () {
        openSettingTab();
        appGlobal.panel.hide();
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
                console.info("showPopup");
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
    }, 2500);

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
            appendedItems = data.items.concat(appendedItems);
            ffStorage.storage.appendedItems = appendedItems.slice(0);

            //如果已追加更新到面板的优惠记录总数 大于 允许的最大数目,就将时间最早的多余条删除掉
            console.info("data.items.length=",data.items.length,"---------appendedItems.length=",appendedItems.length ,"----------------appGlobal.options.maxAppendedItemsSize=",appGlobal.options.maxAppendedItemsSize);
            if (appendedItems.length > appGlobal.options.maxAppendedItemsSize) {
                var delItems = appendedItems.splice(appGlobal.options.maxAppendedItemsSize);  //删除appendedItems多的,并且将删除的返回
                //删除渲染面板中的
                deleteItemsFromPopup(delItems);
                //刷新持久化
                ffStorage.storage.appendedItems = appendedItems.slice(0);
                if(data.items.length> appGlobal.options.maxAppendedItemsSize){
                    data.items = data.items.slice(0,appGlobal.options.maxAppendedItemsSize);
                }
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
        callback({items: appGlobal.noAppendCachedItems.slice(0)});
    } else {
        //否则直接请求smzdm拿最新的推送信息,将其加载到面板上
        updateItems(function () {
            callback({items: appGlobal.noAppendCachedItems.slice(0)});
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

function openSettingTab() {
    var settingUrl = self.data.url("setting.html");
    if (appGlobal.settingTab) {
        //appGlobal.settingTab.reload();
        appGlobal.settingTab.activate();
    } else {
        tabs.open({
            url: settingUrl,
            onOpen: function (tab) {
                appGlobal.settingTab = tab;
            },
            onClose: function () {
                appGlobal.settingTab = null;
            },
            onReady: function(tab){
                var worker = tab.attach({
                    contentScriptFile: [
                        self.data.url("scripts/jquery-2.0.3.min.js"),
                        self.data.url("scripts/jquery.mustache.min.js"),
                        self.data.url("scripts/setting.js")
                    ]
                });

                getCat("get_defcls",function(cats1){
                    console.info("------------------get_defcls-----------------")
                    getCat("get_cls",function(cats2){
                        console.info("------------------get_cls-----------------")
                        worker.port.emit("getCats", cats1,cats2);

                    })
                });

                worker.port.on("getSetting", function(){
                    appGlobal.options["showDesktopNotifications"]="0";
                    worker.port.emit("returnSetting", appGlobal.options);
                });

                worker.port.on("playSound", function(){
                    playSound();
                });

                worker.port.on("addTestData", function(){
                    appGlobal.testIndex++;
                    var t1="post";
                    var t2="国内的"
                    if(appGlobal.testIndex%2==0){
                        t1="ht";
                        t2="国外的";
                    }
                    _updateItems({
                        error:0,
                        data:[{
                            msg_id: 88888+appGlobal.testIndex+"",
                            msg_title: appGlobal.testIndex+"",
                            msg_desc: '“什么值得买”是一个中立的，致力于帮助广大网友买到更有性价比网购产品的推荐类博客。' +
                                '“什么值得买”的目的是在帮助网友控制网购的风险的同时，尽可能的向大家介绍高性价比的网购产品，让大家买着不心疼，花钱等于省钱。' +
                                '同时希望大家在满足自身需求的基础上理性消费，享受特价的同时尽量少的占用其他人机会和资源。',
                            msg_picurl: self.data.url(appGlobal.icons.default),
                            msg_url:appGlobal.smzdmWebAddress,
                            msg_date: Math.floor((new Date()).getTime()/1000),
                            msg_categories: "163,3535,3834",
                            "msg_mall": t2,
                            "msg_type": t1
                        }]
                    });
                    prepareItemsAndSendItemsToPopup({items: appGlobal.noAppendCachedItems.slice(0)});
                });

                worker.port.on("testNotifyBtn", function(){
                    var testItems;
                    if(ffStorage.storage && ffStorage.storage.appendedItems && ffStorage.storage.appendedItems.length>0){
                        testItems=ffStorage.storage.appendedItems.slice(0,1);
                    }else{
                        var testItems=[{
                            msg_title: "倡导理性消费，享受品质生活",
                            msg_desc: '“什么值得买”是一个中立的，致力于帮助广大网友买到更有性价比网购产品的推荐类博客。' +
                                '“什么值得买”的目的是在帮助网友控制网购的风险的同时，尽可能的向大家介绍高性价比的网购产品，让大家买着不心疼，花钱等于省钱。' +
                                '同时希望大家在满足自身需求的基础上理性消费，享受特价的同时尽量少的占用其他人机会和资源。',
                            msg_picurl: self.data.url(appGlobal.icons.default),
                            msg_url:appGlobal.smzdmWebAddress
                        }];
                    }
                    sendDesktopNotification(testItems);
                });

                worker.port.on("storePref", function(pref){
                    appGlobal.options[pref.name]=pref.value;
                    ffStorage.storage[pref.name]=pref.value;
                });

            }
        });
    }
}

function getCat(mod,callback){
    apiRequestWrapper({
        parameters: {
            f:"browser",
            useApiUrlIndex: 2,
            version: appGlobal.smzdmClientVersionStr,
            mod: mod
        },
        onSuccess: function (response) {
            var cats=[];
            if (response["error"] == 0){
                if (response["data"] && response["data"].length > 0) {
                    cats = response["data"];
                }
            }
            if (typeof callback === "function") {
                callback(cats);
            }
        }
    });
}

function _contains(a, obj) {
    var i = a.length;
    while (i--) {
        if (a[i] == obj) {
            return true;
        }
    }
    return false;
}

function  _updateItems(response){
    if (response["error"] == 0) {
        var data = response["data"];
        if (data && data.length > 0) {
            var num = data["length"];

            console.info("current get items length------------------------------------", num);
            //将此次获取到的优惠信息 都加到 未追加面板优惠信息队列中
            appGlobal.noAppendCachedItems = appGlobal.noAppendCachedItems.concat(data);

            //排下序,时间最近的排前面
            appGlobal.noAppendCachedItems = appGlobal.noAppendCachedItems.sort(function (a, b) {
                return  b["msg_date"] - a["msg_date"];
            });
            //取时间最近的一个,做为下次抓取的lasttime条件(持久化)
            ffStorage.storage.lasttime = appGlobal.noAppendCachedItems[0]["msg_date"];
            //过滤下
            var appendItems = ffStorage.storage && ffStorage.storage.appendedItems ? ffStorage.storage.appendedItems : []
            appGlobal.noAppendCachedItems = appGlobal.noAppendCachedItems.filter(function (value, index, items) {
                //noAppendCachedItems ID重复的内容,剔除
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

                //过滤地区
                switch(appGlobal.options.allowItemArea){
                    case 0:
                        break;
                    case 1:
                        if(value["msg_type"]=="ht"){
                            return false;
                        }
                        break;
                    case 2:
                        if(value["msg_type"]!="ht"){
                            return false;
                        }
                        break;
                }

                //过滤关键字
                var isKeyInclud=false;
                if(appGlobal.options.keywordInclud && appGlobal.options.keywordInclud.length>0){
                    var keys=appGlobal.options.keywordInclud.split(",");
                    for (var i = 0; i < keys.length; i++) {
                        if(value["msg_title"].indexOf(keys[i])!=-1 ||  value["msg_desc"].indexOf(keys[i])){
                            isKeyInclud=true;
                            break;
                        }
                    }
                }

                if(!isKeyInclud){
                    //过滤分类
                    var catsTemp=value["msg_categories"].split(",");
                    if(appGlobal.options.catsFilters.length>0 && catsTemp && catsTemp.length>0){
                        var match=false;
                        for (var i = 0; i < catsTemp.length; i++) {
                            if(_contains(appGlobal.options.catsFilters,catsTemp[i])){
                                match=true;
                                break;
                            }
                        }
                        if(!match){
                            return false; //剔除
                        }
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

            if(appGlobal.noAppendCachedItems.length>0){
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
    }
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
            _updateItems(response);
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
            for (var i = (items.length > appGlobal.maxNotificationsCount ? appGlobal.maxNotificationsCount : items.length) - 1;
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


function readOptions() {
    for (var optionName in appGlobal.options) {
        if(ffStorage.storage && ffStorage.storage[optionName]){
            appGlobal.options[optionName] = ffStorage.storage[optionName];
        }
    }
}

/**
 *
 * @param options
 */
exports.main = function (options) {
    readOptions();
    initialize();
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



