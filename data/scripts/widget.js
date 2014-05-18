"use strict";

var widgetGlobal = {
    icons: {
        default: "images/icon20.png",   //登陆后图标,保留
        inactive: "images/icon20.png"   //登陆前图标
    }
};


self.port.on("onItemsUpdate", function (unreadNum) {
    if (!document) return; //Prevent bug when widget didn't initialized yet, but events already emit

    var icon = document.getElementById("smzdm-notifier-icon");
    icon.src = widgetGlobal.icons.inactive;

    var counter = document.getElementById("smzdm-notifier-counter");
    console.info("onItemsUpdate unread------------------------------------", unreadNum);
    if (unreadNum && unreadNum > 0) {
        counter.innerHTML = unreadNum > 9999 ? "&#8734" /* ∞ */ : unreadNum;
        counter.style.display = "block";
    } else {
        counter.innerHTML = "";
        counter.style.display = "none";
    }
});

window.addEventListener("click", function (event) {
    if (event.button === 1) {
        self.port.emit("middle-click", null);//鼠标中键
    } else if (event.button === 0){
        self.port.emit("left-click", null);//鼠标左键
    } else {
        self.port.emit("right-click", null);//鼠标右键
    }

    event.preventDefault();
}, true);