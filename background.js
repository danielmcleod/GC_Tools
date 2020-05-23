let lastScreenshot = Date.now();
let screenShots = 0;
let lastNetworkUp = Date.now();
let lastNetworkState = 1;
let networkTestInterval = null;

const filter = {
    urls: [
        "*://apps.mypurecloud.com/*",
        // "*://apps.mypurecloud.de/*",
        // "*://apps.mypurecloud.ie/*",
        // "*://apps.mypurecloud.com.au/*",
        // "*://apps.mypurecloud.jp/*",
        // "*://apps.*.pure.cloud/*"
    ]
};

const apiFilter = {
    urls: [
        "*://api.mypurecloud.com/*",
        // "*://api.mypurecloud.de/*",
        // "*://api.mypurecloud.ie/*",
        // "*://api.mypurecloud.com.au/*",
        // "*://api.mypurecloud.jp/*",
        // "*://api.*.pure.cloud/*" //not valid
    ]
};

takeScreenshot = (folderName,uuid,date) => {
    const now = Date.now();
    var diff = Math.abs(now - lastScreenshot);
    var minutes = Math.floor((diff/1000)/60);

    var diffNetwork = Math.abs(now - lastNetworkUp);
    var minutesNetwork = Math.floor((diffNetwork/1000)/60);

    const fileName = `gc_tools/${folderName}/screenshot-${now}.jpg`;
    if((minutesNetwork < 6 && minutes > 0) || screenShots === 0){
        chrome.tabs.captureVisibleTab(null, {format: "jpeg", quality: 5}, (img) => {
            lastScreenshot = Date.now();
            screenShots++;
            // console.log(img);
            downloadScreenshot(img,fileName);
            updateLog({logId: uuid,date,fileName});
            testNetwork(uuid,date);
        });
    } else {
        testNetwork(uuid,date);
    }
};

downloadScreenshot = (screenShot,fileName) => {
    const now = Date.now();
    chrome.downloads.setShelfEnabled(false);
    chrome.downloads.download({
        'url': screenShot,
        'filename': fileName,
    },() => {
        setTimeout(() => {
            chrome.downloads.setShelfEnabled(true);
        }, 500);
    })
};

getCpuInfo = () => {
    chrome.system.cpu.getInfo((info) => {
        console.log("CPU Usage:");

        for (let i = 0; i < info.processors.length; i++) {
            const usage = info.processors[i].usage;
            console.log(usage)
        }
    });
};

getMemoryInfo = (uuid,date) => {
    let capacity = 0;
    let availableCapacity = 0;
    chrome.system.memory.getInfo((info) => {
        capacity = info.capacity;
        availableCapacity = info.availableCapacity;
        console.log('Total Memory: ' + capacity);
        console.log('Available Memory: ' + availableCapacity);
        updateLog({logId: uuid,date,capacity,availableCapacity});
        checkForOtherTabs(null,uuid,date);
    });
};

checkForOtherTabs = (tabId,uuid,date) => {
    let gcTabCount = 0;
    let tabUrls = [];

    chrome.windows.getAll({populate: true}, (windows) => {
        windows.map((window) => {
            window.tabs.map((tab) => {
                try {
                    // console.log(tab.url);
                    tabUrls.push(tab.url);
                    if(isGenesysCloudUrl(tab.url)){
                        gcTabCount++;
                    }
                }
                catch (e) {
                    console.error(e);
                }
            });
        });

        if(gcTabCount > 1){
            updateLog({logId: uuid,date,gcTabCount,tabUrls});
            console.log("Genesys Cloud Tabs: " + gcTabCount);
            if((tabId||null) !== null){
                const options = {
                    type: 'basic',
                    title: 'Multiple Genesys Cloud Tabs Detected',
                    message: 'Duplicate tab closed. You should only have one Genesys Cloud tab open.',
                    priority: 1,
                    iconUrl:'../images/icon_128.png'
                };
                chrome.notifications.create("", options, (id) => {});
                updateLog({logId: uuid,date,closedTab: true});
                chrome.tabs.remove(tabId);
            }
        }
        // else {
        //     updateLog({logId: uuid,date,gcTabCount});
        // }

    });
};

isGenesysCloudUrl = (url) => {
    return url.includes("apps.mypurecloud") ? true : false;
};

testNetwork = (uuid,date) => {
    let networkUp = false;
    const now = Date.now().toString();

    fetch("https://help.mypurecloud.com/favicon.png?now="+now)
        .then((response) => {
            const status = response.status;
            if(status === 200){
                networkUp = true;
                if((networkTestInterval||null) !== null){
                    clearInterval(networkTestInterval);
                    networkTestInterval = null;
                }

                console.log("last: "+ lastNetworkState)
                const prevState = lastNetworkState === 0 ? 0 : 1;
                lastNetworkState = 1;

                lastNetworkUp = Date.now();
                console.log("prev: "+ prevState)
                console.log("Can reach internet? : " + networkUp);
                updateLog({logId: uuid,date,networkUp});

                if(prevState === 0){
                    chrome.storage.local.get(['logs'], (result) => {
                        let logs = result.logs||[];
                        if(logs.length > 0){
                            downloadLogs(logs);
                        }
                    });
                }
                else {
                    getMemoryInfo(uuid,date);
                }
            } else {
                let error = new Error(response.statusText);
                error.response = response;
                throw error
            }
        })
        .then(() => {

        })
        .catch((error) => {
            lastNetworkState = 0;
            console.log("Can reach internet? : " + false);
            updateLog({logId: uuid,date,networkUp: false});
            const d = new Date().toJSON();
            if((networkTestInterval||null) === null){
                networkTestInterval = setInterval(() => testNetwork(uuid,d), 2000);
                getMemoryInfo(uuid,date);
            }
        })
};

downloadLogs = (logs) => {
    try{
        const now = Date.now();
        const date = new Date().toJSON().slice(0,10);
        var json = JSON.stringify(logs);
        var blob = new Blob([json], {type: "application/json"});
        var url  = URL.createObjectURL(blob);
        chrome.downloads.setShelfEnabled(false);
        chrome.downloads.download({
            'url': url,
            'filename': `gc_tools/${date}/log-${now}.json`,
        },() => {
            chrome.storage.local.set({logs: []}, () => {
                // console.log('Value is set to ' + value);
            });
            setTimeout(() => {
                chrome.downloads.setShelfEnabled(true);
            }, 500);
        })
    }
    catch (e) {
        console.error(e);
    }
};

updateLog = (entry) => {
    chrome.storage.local.get(['logs'], (result) => {
        let logs = result.logs||[];
        logs.push(entry);
        if(logs.length >= 25){
            downloadLogs(logs);
        } else {
            chrome.storage.local.set({logs: logs}, () => {
                // console.log('Value is set to ' + value);
            });
        }
    });
};

checkForLogs = () => {
    chrome.storage.local.get(['logs'], (result) => {
        let logs = result.logs||null;
        if((logs||null) !== null && logs.length > 0){
            downloadLogs(logs);
            chrome.storage.local.set({logs: []}, () => {
                // console.log('Value is set to ' + value);
            });
        }
    });
};

uuidv4 = () => {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

chrome.webNavigation.onCompleted.addListener((tab) => {
    if(tab.frameId === 0){
        const tabId = tab.tabId;
        const uuid = uuidv4();
        checkForOtherTabs(tabId,uuid);
    }
}, filter );

chrome.webRequest.onErrorOccurred.addListener((e) => {
    const date = new Date().toJSON();
    const uuid = uuidv4();
    const networkConnected = navigator.onLine;
    console.log("Connected to local network?:" + networkConnected);
    updateLog({logId: uuid,date,networkConnected});
    takeScreenshot(date.slice(0,10),uuid,date);
}, apiFilter );

console.log("gc_tools loaded..");
checkForLogs();
