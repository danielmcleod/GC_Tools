let _lastScreenshot = Date.now();
let _screenShots = 0;
let _lastNetworkUp = Date.now();
let _lastNetworkState = 1;
let _networkTestInterval = null;
let _gcTabId = null;
let _savingScreenshot = false;
let _savingLog = false;
//logs
let _wsErrors = [];
let _errors = [];
let _memUsage = [];
let _internetConnectivity = [];
let _screenShotLog = [];
let _networkConnectivity = [];

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
        "wss://streaming.mypurecloud.com/*"
    ]
};

takeScreenshot = (uuid) => {
    if(_savingScreenshot){
        return;
    }

    _savingScreenshot = true;
    const now = Date.now();
    var diff = Math.abs(now - _lastScreenshot);
    var minutes = Math.floor((diff/1000)/60);

    var diffNetwork = Math.abs(now - _lastNetworkUp);
    var minutesNetwork = Math.floor((diffNetwork/1000)/60);
    const date = getDate();
    const folderName = date.slice(0,10);

    const fileName = `gc_tools/${folderName}/screenshot-${now}.jpg`;
    if((minutesNetwork < 6 && minutes > 0) || _screenShots === 0){
        try{
            chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, {format: "jpeg", quality: 10}, (img) => {
                if((img||null) !== null){
                    _lastScreenshot = Date.now();
                    _screenShots++;
                    downloadScreenshot(img,fileName);
                    _screenShotLog.push({
                        title: 'Screenshot Generated',
                        summary: fileName,
                        date: date,
                        id: uuid
                    })
                } else {
                }
            });
        } catch (e) {
            _savingScreenshot = false;
            console.log("Screenshot Error:" + e);
        }
    }
};

downloadScreenshot = (screenShot,fileName) => {
    try{
        const now = Date.now();
        chrome.downloads.setShelfEnabled(false);
        chrome.downloads.download({
            'url': screenShot,
            'filename': fileName,
        },() => {
            _savingScreenshot = false;
            setTimeout(() => {
                chrome.downloads.setShelfEnabled(true);
            }, 500);
        })
    } catch (e) {
        _savingScreenshot = false;
        console.log("Screenshot Error:" + e);
    }
};

// getCpuInfo = () => {
//     chrome.system.cpu.getInfo((info) => {
//         console.log("CPU Usage:");
//
//         for (let i = 0; i < info.processors.length; i++) {
//             const usage = info.processors[i].usage;
//             console.log(usage)
//         }
//     });
// };

getMemoryInfo = (uuid) => {
    let capacity = 0;
    let availableCapacity = 0;
    chrome.system.memory.getInfo((info) => {
        capacity = info.capacity;
        availableCapacity = info.availableCapacity;

        console.log('Total Memory: ' + capacity);
        console.log('Available Memory: ' + availableCapacity);
        const date = getDate();

        _memUsage.push({
            title: 'Memory Usage',
            summary: `${(capacity-availableCapacity)} / ${capacity}`,
            date: date,
            id: uuid
        })
    });
};

checkForOtherTabs = (tabId) => {
    let gcTabCount = 0;

    chrome.windows.getAll({populate: true}, (windows) => {
        windows.map((window) => {
            window.tabs.map((tab) => {
                try {
                    // console.log(tab.url);
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
            const date = getDate();
            generateLog([{
                title: 'Multiple Tabs',
                summary: 'Multiple Genesys Cloud Tabs Detected. The duplicate tab was closed.',
                date: date,
            }],'MultipleTabs'); //todo:
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
                chrome.tabs.remove(tabId);
            }
        } else {
            _gcTabId = tabId;
        }
    });
};

isGenesysCloudUrl = (url) => {
    return (url.includes("apps.mypurecloud") || url.includes("streaming.mypurecloud")) ? true : false;
};

testNetwork = (uuid) => {
    testConnection(uuid);
    let networkUp = false;
    const now = Date.now().toString();

    fetch("https://help.mypurecloud.com/favicon.png?now="+now)
        .then((response) => {
            const status = response.status;
            if(status === 200){
                networkUp = true;
                if((_networkTestInterval||null) !== null){
                    clearInterval(_networkTestInterval);
                    _networkTestInterval = null;
                }

                const prevState = _lastNetworkState === 0 ? 0 : 1;
                _lastNetworkState = 1;

                _lastNetworkUp = Date.now();
                console.log("Can reach internet? : " + networkUp);
                const date = getDate();

                _internetConnectivity.push({
                    title: 'Internet Connectivity',
                    summary: 'true',
                    date: date,
                    id: uuid
                });

                if(prevState === 0){
                    setTimeout(() => {
                        generateAllLogs();
                    }, 5000);
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
            _lastNetworkState = 0;
            console.log("Can reach internet? : " + false);
            const date = getDate();

            _internetConnectivity.push({
                title: 'Internet Connectivity',
                summary: 'false',
                date: date,
                id: uuid
            });

            const d = new Date().toJSON();
            if((_networkTestInterval||null) === null){
                _networkTestInterval = setInterval(() => testNetwork(uuid,d), 2000);
            }
        })
};

testConnection = (uuid) => {
    const networkConnected = navigator.onLine;
    console.log("Connected to local network?:" + networkConnected);

    const date = getDate();

    _networkConnectivity.push({
        title: 'Network Connectivity',
        summary: networkConnected.toString(),
        date: date,
        id: uuid
    });
};

generateAllLogs = () => {
    const logs = _errors.concat(_wsErrors,_memUsage,_screenShotLog,_internetConnectivity,_networkConnectivity);
    if(logs.length > 0){
        logs.sort((a, b) => b.date - a.date);
        generateLog(logs,'Log');
        _wsErrors = [];
        _errors = [];
        _memUsage = [];
        _internetConnectivity = [];
        _screenShotLog = [];
        _networkConnectivity = [];
    }
};

generateLog = (logs,filename) => {
    if(_savingLog){
        return;
    }
    _savingLog = true;
    try{
        const now = Date.now();
        const date = new Date().toJSON().slice(0,10);
        var json = JSON.stringify(logs);
        var blob = new Blob([json], {type: "application/json"});
        var url  = URL.createObjectURL(blob);
        if((url||null) !== null){
            chrome.downloads.setShelfEnabled(false);
            chrome.downloads.download({
                'url': url,
                'filename': `gc_tools/${date}/${filename}-${now}.json`,
            },() => {
                _savingLog = false;
                setTimeout(() => {
                    chrome.downloads.setShelfEnabled(true);
                }, 500);
            })
        } else {
            console.error("Error downloading logs..");
            _savingLog = false;
        }
    }
    catch (e) {
        _savingLog = false;
        console.error(e);
    }
};

getDate = () => {
    const date = new Date().toJSON();
    return date;
};

uuidv4 = () => {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

chrome.webNavigation.onCompleted.addListener((tab) => {
    if(tab.frameId === 0){
        const tabId = tab.tabId;
        checkForOtherTabs(tabId);
    }
}, filter );

chrome.webRequest.onErrorOccurred.addListener((e) => {
    //save on browser close or periodically
    //potentially remove filter and do a network check on all failed requests
    //periodically check network and resource usage

    console.log("WebRequest Error:" + JSON.stringify(e));

    //error
    //method
    //type
    //url

    const uuid = uuidv4();
    const date = getDate();

    if(e.type === 'websocket'){
        _wsErrors.push({
            title: 'WebRequest Websocket Error',
            summary: JSON.stringify(e),
            date: date,
            id: uuid
        });

        if(_wsErrors.length > 4 && _lastNetworkState === 1){
            testNetwork(uuid);
            takeScreenshot(uuid);
            getMemoryInfo(uuid);
        }
    } else {
        _errors.push({
            title: 'WebRequest Error',
            summary: JSON.stringify(e),
            date: date,
            id: uuid
        });

        if(_lastNetworkState === 1){
            testNetwork(uuid);
            takeScreenshot(uuid);
            getMemoryInfo(uuid);
        }
    }
}, apiFilter );

chrome.windows.onRemoved.addListener(() => {
    generateAllLogs();
})

chrome.tabs.onRemoved.addListener((tabId) => {
    if(_gcTabId === tabId){
        _gcTabId = null;
        generateAllLogs();
    }
})

console.log("gc_tools loaded..");
