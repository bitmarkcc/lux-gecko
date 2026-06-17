browser.runtime.onMessage.addListener(processMessages);
//document.body.style.border = "5px solid blue";

let xuid = null;
let postButtonFound = false;

function processMessages(request, sender, sendResponse) {
    if (request.action == "sendcookies") {
	//console.log('kdt = '+request.kdt);
	//console.log('twid = '+request.twid);
	//console.log('ct0 = '+request.ct0);
	//console.log('auth_token = '+request.auth_token);	
	xuid = request.twid.substring(4);
    }
}

const re1 = /Post/;
const re2 = /Repost/;

function setButtonEvents() {
    if (true) {
	const buttons = document.querySelectorAll('button,[role="menuitem"]');
	buttons.forEach((item) => {
	    //console.log("item textContent = "+item.textContent);
	    if (item.textContent.match(re1) || item.textContent.match(re2)) {
		item.addEventListener('click', function() {
		    console.log("mark new post with xuid "+xuid+" in 10 seconds...");
		    setTimeout(() => {browser.runtime.sendMessage({from: "content", action: "markpost", "xuid": xuid, count: 2, cursor: null});},10000);
		});
		postButtonFound = true;
		//console.log("added event listener for button");
	    }
	});
    }
}

browser.runtime.sendMessage({from: "content", action: "getcookies"});
setButtonEvents();
setInterval(setButtonEvents,1000); // look for 'Post' buttons every second

//getActive.then(getCookies);

/*
         *
         * // Creating a new Rettiwt instance using the given 'API_KEY'
         * const rettiwt = new Rettiwt({ apiKey: API_KEY });
         *
         * // Fetching the first 20 timeline tweets of the User with id '1234567890'
         * rettiwt.user.timeline('1234567890')
         * .then(res => {
         *      console.log(res);
         * })
         * .catch(err => {
         *      console.log(err);
         * });
	 */
