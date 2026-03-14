// Track downloads we are pausing for disk check
const checkingDownloads = new Set();

chrome.downloads.onCreated.addListener(async (item) => {
    console.log("Download started:", item);

    try {
        // Pause the download immediately - simple approach like Flask version
        await chrome.downloads.pause(item.id);
        console.log("Download paused successfully:", item.id);

        // Pause the download immediately
        await chrome.downloads.pause(item.id);
        console.log("Download paused successfully:", item.id);

        // Open the popup automatically
        try {
            await chrome.action.openPopup();
        } catch (err) {
            console.log("Could not auto-open popup:", err);
            chrome.action.setBadgeText({ text: "!" });
            chrome.action.setBadgeBackgroundColor({ color: "#f44336" });
        }
    } catch (error) {
        // Handle "must be in progress" error gracefully - this happens when download
        // completes or is interrupted before we can pause it
        const errorMsg = error.message || error.toString() || String(error);
        if (errorMsg.includes('must be in progress') || errorMsg.includes('Download must be in progress')) {
            console.log("Download not in progress (completed or interrupted), skipping");
            return;
        }
        
        // For other errors, log but don't cancel
        console.error("Error pausing download:", error);
    }
});

// Smart Categorization: Route files based on extensions
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const filename = item.filename;
    const extension = filename.split('.').pop().toLowerCase();

    let subfolder = "";

    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm'];
    const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac'];
    const codeExts = ['js', 'py', 'html', 'css', 'json', 'cpp', 'java'];

    if (imageExts.includes(extension)) {
        subfolder = "Images/";
    } else if (videoExts.includes(extension)) {
        subfolder = "Videos/";
    } else if (docExts.includes(extension)) {
        subfolder = "Documents/";
    } else if (archiveExts.includes(extension)) {
        subfolder = "Archives/";
    } else if (audioExts.includes(extension)) {
        subfolder = "Audio/";
    } else if (codeExts.includes(extension)) {
        subfolder = "Code/";
    } else {
        subfolder = "Others/";
    }

    suggest({
        filename: subfolder + filename,
        conflictAction: 'uniquify'
    });
});
