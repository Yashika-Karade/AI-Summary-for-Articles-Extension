chrome.runtime.onInstalled.addListener(()=>{
    chrome.storage.sync.get(["geminiAPIkey"],(result)=>{
        if(!result.geminiAPIkey){
            chrome.tabs.create({url:"options.html"})
        }
    })
})