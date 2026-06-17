let getting1 = null;
let getting2 = null;
let getting3 = null;
let getting4 = null;
let cookie1val = null;
let cookie2val = null;
let cookie3val = null;
let cookie4val = null
let tabid = null
let apicalls = {}

// Whether marking is enabled. Toggled from the browser-action popup and stored
// in browser.storage.local. Defaults to on (so behaviour is unchanged unless
// the user turns it off).
function isEnabled() {
    return browser.storage.local.get("xmarkEnabled").then(function(r) {
        return r.xmarkEnabled !== false;
    });
}

function onGot(item) {
    for (var k in item) {
        var itemk = item[k];
        if (k.includes("markpostattempt")) {
            var attempttime = parseInt(k.substring(16));
            var attemptdate = new Date(attempttime);
            console.log("mark-post-attempt ("+attemptdate.toISOString()+"): xuid="+itemk["xuid"]+" count="+itemk["count"]+" cursor="+itemk["cursor"]);
        }
        else if (k.includes("markpostresult")) {
            var resulttime = parseInt(k.substring(15));
            var resultdate = new Date(resulttime);
            console.log("mark-post-result ("+resultdate.toISOString()+"): xmkhash="+itemk["xmkhash"]+" postid="+itemk["postid"]);
        }
    }
}

function onError(error) {
    console.log(`Error: ${error}`);
}

function setItem() {
    //console.log("OK setItem");
}

function setCookie1(cookie) {
    if (cookie) {
        cookie1val = cookie.value;
    }
    getting2.then(setCookie2);
}

function setCookie2(cookie) {
    if (cookie) {
        cookie2val = cookie.value;
    }
    getting3.then(setCookie3);
}

function setCookie3(cookie) {
    if (cookie) {
        cookie3val = cookie.value;
    }
    getting4.then(setCookie4);
}

function setCookie4(cookie) {
    if (cookie) {
        cookie4val = cookie.value;
    }
    browser.tabs.sendMessage(tabid, {action: "sendcookies", kdt: cookie1val, twid: cookie2val, ct0: cookie3val, auth_token: cookie4val});
}

function getCookies(tab) {
    const tabUrl = tab.url;
    tabid = tab.id;
    getting1 = browser.cookies.get({
        url: tabUrl,
        name: "kdt",
    });
    getting2 = browser.cookies.get({
        url: tabUrl,
        name: "twid",
    });
    getting3 = browser.cookies.get({
        url: tabUrl,
        name: "ct0",
    });
    getting4 = browser.cookies.get({
        url: tabUrl,
        name: "auth_token",
    });
    getting1.then(setCookie1);
    //console.log("local storage data:")
    let gettingItem = browser.storage.local.get();
    gettingItem.then(onGot, onError);
}

function markPost (xuid,count,cursor) {
    var curTime = Date.now();
    var attemptObj = {};
    attemptObj["markpostattempt_"+curTime] = {"xuid": xuid, "count": count, "cursor": cursor};
    browser.storage.local.set(attemptObj).then(setItem, onError);
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState==4 && this.status==200) {
            console.log("server responded with "+this.responseText);
            var response = JSON.parse(this.responseText);
            var posts = response["posts"];
            for (let p = 0; p<posts.length; p++) {
                var xmkhash = posts[p]["hash"];
                var postid = posts[p]["postid"];
                var munixtime = Date.now();
                var resultObject = {}
                resultObject["markpostresult_"+munixtime] = {"xmkhash": xmkhash, "postid": postid};
                browser.storage.local.set(resultObject).then(setItem, onError);
            }
        }
    }
    xmlhttp.open("GET","https://xmark.cc/cgi-bin/act?a=markpost&xuid="+encodeURIComponent(xuid)+"&count="+encodeURIComponent(count)+"&cursor="+encodeURIComponent(cursor),true);
    xmlhttp.send();
}

browser.runtime.onMessage.addListener( function(message, sender, sendResponse) {
  if(message.from && message.from === "content"){
    switch(message.action){
    case "getcookies":
        getCookies(sender.tab);
        break;
    case "markpost":
        isEnabled().then(function(enabled) {
            if (!enabled) { return; } // marking toggled off from the popup
            var xuid = message.xuid;
            var curTime = Date.now();
            if (xuid in apicalls && curTime - apicalls[xuid]["time"] < 5000) {
                return; // wait 5 seconds before processing another
            }
            apicalls[xuid] = {"time": curTime};
            markPost(xuid, message.count, message.cursor);
        });
        break;
    }
  }
});
