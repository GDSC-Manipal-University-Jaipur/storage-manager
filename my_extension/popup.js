// Native Messaging version - uses native messaging instead of HTTP
// This file replaces popup.js when using native messaging

document.addEventListener("DOMContentLoaded", async () => {
    // Load disk info on startup
    loadDiskInfo('/');

    // Start polling for downloads
    startDownloadPolling();

    // Update backend stats
    updateBackendStats();
});

// ---------- Disk Info ----------

async function loadDiskInfo(path) {
    const diskInfoDiv = document.getElementById("diskInfo");
    diskInfoDiv.innerHTML = '<div class="loading">Loading disk space...</div>';

    try {
        const data = await sendNativeMessage('info', { path: path });

        if (!data.ok) {
            throw new Error(data.error || "Failed to get disk info");
        }

        const percentUsed = data.percent_used;
        const percentFree = 100 - percentUsed;

        let colorClass = "high";
        if (percentFree < 10) colorClass = "low";
        else if (percentFree < 25) colorClass = "medium";

        // SVG circle math
        const radius = 65;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentFree / 100) * circumference;

        diskInfoDiv.innerHTML = `
            <div class="disk-title">Available Disk Space</div>
            <div class="circle-progress-wrapper">
                <svg viewBox="0 0 160 160">
                    <defs>
                        <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#7ec8c8" />
                            <stop offset="100%" stop-color="#9b7ed8" />
                        </linearGradient>
                        <linearGradient id="circleGradWarn" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#f0c060" />
                            <stop offset="100%" stop-color="#e09040" />
                        </linearGradient>
                        <linearGradient id="circleGradDanger" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#e87070" />
                            <stop offset="100%" stop-color="#d04040" />
                        </linearGradient>
                    </defs>
                    <circle class="circle-inner-bg" cx="80" cy="80" r="52" />
                    <circle class="circle-bg" cx="80" cy="80" r="${radius}" />
                    <circle class="circle-fill ${colorClass}" cx="80" cy="80" r="${radius}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}" />
                </svg>
                <div class="circle-center-text">
                    <span class="circle-free-value">${data.free_gb}<span class="unit">GB</span></span>
                    <span class="circle-free-label">Free</span>
                    <span class="circle-used-inner">Used: ${data.used_gb} GB</span>
                </div>
            </div>
            <div class="disk-usage-summary">
                <span>Used: ${data.used_gb} GB</span>
                <span class="dot"></span>
                <span>Total: ${data.total_gb} GB</span>
            </div>
        `;
    } catch (err) {
        console.error("Error loading disk info:", err);
        diskInfoDiv.innerHTML = `
            <div class="loading" style="color: #c05050;">
                ⚠️ Could not load disk space info.<br>
                <small>Make sure native host is installed</small>
            </div>
        `;
    }
}

function sendNativeMessage(command, params = {}) {
    return new Promise((resolve, reject) => {
        const message = {
            command: command,
            ...params
        };

        chrome.runtime.sendNativeMessage('com.storage_checker', message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Native host connection failed'));
                return;
            }

            if (!response) {
                reject(new Error('No response from native host'));
                return;
            }

            if (response.ok === false) {
                reject(new Error(response.error || 'Unknown error'));
            } else {
                resolve(response);
            }
        });
    });
}

// ---------- Download Manager ----------

let downloadPollInterval;

function startDownloadPolling() {
    renderDownloads();
    downloadPollInterval = setInterval(renderDownloads, 800);
}

function renderDownloads() {
    chrome.downloads.search({}).then((downloads) => {
        const listDiv = document.getElementById('downloadsList');
        const emptyState = document.getElementById('managerEmptyState');

        // Filter to active downloads (in progress or paused)
        const activeDownloads = downloads.filter(dl =>
            dl.state === 'in_progress' || dl.state === 'paused'
        );

        if (activeDownloads.length === 0) {
            listDiv.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        // Clear existing items
        listDiv.innerHTML = '';

        // Sort by start time (newest first)
        activeDownloads.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

        activeDownloads.forEach(dl => {
            const item = createDownloadItem(dl);
            listDiv.appendChild(item);
        });
    }).catch(err => {
        console.error('Error rendering downloads:', err);
    });
}

function createDownloadItem(dl) {
    const template = document.getElementById('downloadItemTemplate');
    const item = template.content.cloneNode(true);

    const nameSpan = item.querySelector('.dl-name');
    const statusSpan = item.querySelector('.dl-status');
    const progressFill = item.querySelector('.dl-progress-fill');
    const sizeSpan = item.querySelector('.dl-size');
    const speedSpan = item.querySelector('.dl-speed');
    const pauseBtn = item.querySelector('.dl-btn-pause');
    const resumeBtn = item.querySelector('.dl-btn-resume');
    const cancelBtn = item.querySelector('.dl-btn-cancel');

    // Set name
    const filename = dl.filename.split(/[\\/]/).pop();
    nameSpan.textContent = filename;

    // Set status
    let statusText = '';
    if (dl.state === 'paused') {
        statusText = '⏸ Paused';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'inline-block';
    } else if (dl.state === 'in_progress') {
        statusText = '⬇ Downloading';
        pauseBtn.style.display = 'inline-block';
        resumeBtn.style.display = 'none';
    }
    statusSpan.textContent = statusText;

    // Set progress
    const progress = dl.totalBytes > 0 ? (dl.bytesReceived / dl.totalBytes) * 100 : 0;
    progressFill.style.width = progress + '%';

    // Set size
    const received = formatBytes(dl.bytesReceived);
    const total = formatBytes(dl.totalBytes);
    sizeSpan.textContent = `${received} / ${total}`;

    // Set speed (if available)
    if (dl.estimatedEndTime) {
        const remaining = new Date(dl.estimatedEndTime) - new Date();
        if (remaining > 0) {
            const remainingBytes = dl.totalBytes - dl.bytesReceived;
            const speed = remainingBytes / (remaining / 1000);
            speedSpan.textContent = formatBytes(speed) + '/s';
        } else {
            speedSpan.textContent = '';
        }
    } else {
        speedSpan.textContent = '';
    }

    // Set up button handlers
    pauseBtn.onclick = () => {
        chrome.downloads.pause(dl.id).then(() => {
            notifyBackend('pause', dl.id);
            renderDownloads();
        }).catch(err => console.error('Pause error:', err));
    };

    resumeBtn.onclick = () => {
        chrome.downloads.resume(dl.id).then(() => {
            notifyBackend('resume', dl.id);
            renderDownloads();
        }).catch(err => console.error('Resume error:', err));
    };

    cancelBtn.onclick = () => {
        chrome.downloads.cancel(dl.id).then(() => {
            notifyBackend('cancel', dl.id);
            renderDownloads();
        }).catch(err => console.error('Cancel error:', err));
    };

    return item;
}

// Safe wrapper for native messaging — never throws, never blocks
function notifyBackend(action, id) {
    try {
        chrome.runtime.sendNativeMessage(
            'com.storagemanager.app',
            { action: action, id: id }
        ).then(() => { }).catch(() => { });
    } catch (e) {
        // sendNativeMessage threw synchronously — native host probably not installed
    }
}

function updateBackendStats() {
    try {
        chrome.runtime.sendNativeMessage(
            'com.storagemanager.app',
            { action: 'get_stats' }
        ).then(data => {
            if (data && data.ok && data.stats) {
                const sp = document.getElementById("statPause");
                const sr = document.getElementById("statResume");
                const sc = document.getElementById("statCancel");
                if (sp) sp.textContent = data.stats.pause || 0;
                if (sr) sr.textContent = data.stats.resume || 0;
                if (sc) sc.textContent = data.stats.cancel || 0;
            }
        }).catch(() => { });
    } catch (e) { }
}

// Format bytes to human-readable
function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}
// ---------- Disk Info ----------

async function loadDiskInfo(path) {
    const diskInfoDiv = document.getElementById("diskInfo");
    diskInfoDiv.innerHTML = '<div class="loading">Loading disk space...</div>';

    try {
        const data = await sendNativeMessage('info', { path: path });
        
        if (!data.ok) {
            throw new Error(data.error || "Failed to get disk info");
        }

        const percentUsed = data.percent_used;
        const percentFree = 100 - percentUsed;

        let colorClass = "high";
        if (percentFree < 10) colorClass = "low";
        else if (percentFree < 25) colorClass = "medium";

        // SVG circle math
        const radius = 65;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentFree / 100) * circumference;

        diskInfoDiv.innerHTML = `
            <div class="disk-title">Available Disk Space</div>
            <div class="circle-progress-wrapper">
                <svg viewBox="0 0 160 160">
                    <defs>
                        <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#7ec8c8" />
                            <stop offset="100%" stop-color="#9b7ed8" />
                        </linearGradient>
                        <linearGradient id="circleGradWarn" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#f0c060" />
                            <stop offset="100%" stop-color="#e09040" />
                        </linearGradient>
                        <linearGradient id="circleGradDanger" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stop-color="#e87070" />
                            <stop offset="100%" stop-color="#d04040" />
                        </linearGradient>
                    </defs>
                    <circle class="circle-inner-bg" cx="80" cy="80" r="52" />
                    <circle class="circle-bg" cx="80" cy="80" r="${radius}" />
                    <circle class="circle-fill ${colorClass}" cx="80" cy="80" r="${radius}"
                        stroke-dasharray="${circumference}"
                        stroke-dashoffset="${offset}" />
                </svg>
                <div class="circle-center-text">
                    <span class="circle-free-value">${data.free_gb}<span class="unit">GB</span></span>
                    <span class="circle-free-label">Free</span>
                    <span class="circle-used-inner">Used: ${data.used_gb} GB</span>
                </div>
            </div>
            <div class="disk-usage-summary">
                <span>Used: ${data.used_gb} GB</span>
                <span class="dot"></span>
                <span>Total: ${data.total_gb} GB</span>
            </div>
        `;
    } catch (err) {
        console.error("Error loading disk info:", err);
        diskInfoDiv.innerHTML = `
            <div class="loading" style="color: #c05050;">
                ⚠️ Could not load disk space info.<br>
                <small>Make sure native host is installed</small>
            </div>
        `;
    }
}

function sendNativeMessage(command, params = {}) {
    return new Promise((resolve, reject) => {
        const message = {
            command: command,
            ...params
        };

        chrome.runtime.sendNativeMessage('com.storage_checker', message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || 'Native host connection failed'));
                return;
            }
            
            if (!response) {
                reject(new Error('No response from native host'));
                return;
            }
            
            if (response.ok === false) {
                reject(new Error(response.error || 'Unknown error'));
            } else {
                resolve(response);
            }
        });
    });
}

function showError(message) {
    const errorDiv = document.getElementById("errorMessage");
    errorDiv.textContent = message;
    errorDiv.classList.add("show");
    setTimeout(() => { errorDiv.classList.remove("show"); }, 5000);
}

// ---------- Download Manager ----------

function startDownloadPolling() {
    renderDownloads();
    downloadPollInterval = setInterval(renderDownloads, 800);
}

// Safe wrapper for native messaging — never throws, never blocks
function notifyBackend(action, id) {
    try {
        chrome.runtime.sendNativeMessage(
            'com.storagemanager.app',
            { action: action, id: id }
        ).then(() => { }).catch(() => { });
    } catch (e) {
        // sendNativeMessage threw synchronously — native host probably not installed
    }
}

function updateBackendStats() {
    try {
        chrome.runtime.sendNativeMessage(
            'com.storagemanager.app',
            { action: 'get_stats' }
        ).then(data => {
            if (data && data.ok && data.stats) {
                const sp = document.getElementById("statPause");
                const sr = document.getElementById("statResume");
                const sc = document.getElementById("statCancel");
                if (sp) sp.textContent = data.stats.pause || 0;
                if (sr) sr.textContent = data.stats.resume || 0;
                if (sc) sc.textContent = data.stats.cancel || 0;
            }
        }).catch(() => { });
    } catch (e) { }
}

// Format bytes to human-readable
function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 B";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

// Track which download IDs have event listeners attached
const attachedListeners = new Set();

// Flag to prevent concurrent renders
let isRendering = false;

async function renderDownloads() {
    if (isRendering) return;
    isRendering = true;

    try {
        const allDownloads = await chrome.downloads.search({});

        // Filter: only show active/paused/resumable downloads
        const activeDownloads = allDownloads.filter(dl => {
            if (dl.state === 'in_progress') return true;
            if (dl.state === 'interrupted' && dl.canResume) return true;
            return false;
        });

        const listDiv = document.getElementById("downloadsList");
        const emptyState = document.getElementById("managerEmptyState");
        const template = document.getElementById("downloadItemTemplate");

        if (activeDownloads.length === 0) {
            emptyState.style.display = "flex";
            listDiv.style.display = "none";
            listDiv.innerHTML = '';
            attachedListeners.clear();
            isRendering = false;
            return;
        }

        emptyState.style.display = "none";
        listDiv.style.display = "flex";

        // Remove DOM items for downloads that are no longer active
        const activeIds = new Set(activeDownloads.map(dl => String(dl.id)));
        Array.from(listDiv.querySelectorAll('.download-item')).forEach(item => {
            if (!activeIds.has(item.dataset.dlid)) {
                item.remove();
                attachedListeners.delete(item.dataset.dlid);
            }
        });

        for (const dl of activeDownloads) {
            const dlIdStr = String(dl.id);
            let itemDiv = listDiv.querySelector(`.download-item[data-dlid="${dlIdStr}"]`);

            if (!itemDiv) {
                const clone = template.content.cloneNode(true);
                itemDiv = clone.querySelector('.download-item');
                itemDiv.setAttribute('data-dlid', dlIdStr);
                listDiv.appendChild(itemDiv);
            }

            // ---- Update display ----

            // File name
            const dlName = dl.filename ? dl.filename.split(/[\\/]/).pop() : (dl.url || 'Unknown');
            const nameEl = itemDiv.querySelector('.dl-name');
            nameEl.textContent = dlName;
            nameEl.title = dl.filename || dl.url || '';

            // Progress
            let progress = 0;
            const downloadedStr = formatBytes(dl.bytesReceived);
            let totalStr = "Unknown size";

            if (dl.totalBytes && dl.totalBytes > 0) {
                progress = (dl.bytesReceived / dl.totalBytes) * 100;
                totalStr = formatBytes(dl.totalBytes);
            }

            const progressFill = itemDiv.querySelector('.dl-progress-fill');
            progressFill.style.width = progress.toFixed(1) + '%';

            // Size + percentage text
            const sizeEl = itemDiv.querySelector('.dl-size');
            if (dl.totalBytes && dl.totalBytes > 0) {
                sizeEl.textContent = `${downloadedStr} / ${totalStr} (${progress.toFixed(1)}%)`;
            } else {
                sizeEl.textContent = `${downloadedStr} / ${totalStr}`;
            }

            // Status + button visibility
            const statusSpan = itemDiv.querySelector('.dl-status');
            const btnPause = itemDiv.querySelector('.dl-btn-pause');
            const btnResume = itemDiv.querySelector('.dl-btn-resume');
            const btnCancel = itemDiv.querySelector('.dl-btn-cancel');

            if (dl.paused) {
                statusSpan.textContent = "Paused";
                progressFill.classList.add("paused");
                btnPause.style.display = "none";
                btnResume.style.display = "flex";
                btnCancel.style.display = "flex";
            } else if (dl.state === 'interrupted') {
                statusSpan.textContent = "Interrupted";
                progressFill.classList.add("paused");
                btnPause.style.display = "none";
                btnResume.style.display = "flex";
                btnCancel.style.display = "flex";
            } else {
                statusSpan.textContent = "Downloading";
                progressFill.classList.remove("paused");
                btnPause.style.display = "flex";
                btnResume.style.display = "none";
                btnCancel.style.display = "flex";
            }

            // ---- Attach event listeners ONCE per download ----
            if (!attachedListeners.has(dlIdStr)) {
                attachedListeners.add(dlIdStr);

                // We capture dl.id in a local const to avoid stale closures
                const capturedId = dl.id;

                btnPause.addEventListener('click', function handlePause(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Pause clicked for download:", capturedId);
                    chrome.downloads.pause(capturedId)
                        .then(() => {
                            console.log("Pause successful:", capturedId);
                            notifyBackend('pause', capturedId);
                        })
                        .catch(err => console.error("Pause failed:", err));
                });

                btnResume.addEventListener('click', function handleResume(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Resume clicked for download:", capturedId);
                    chrome.downloads.resume(capturedId)
                        .then(() => {
                            console.log("Resume successful:", capturedId);
                            notifyBackend('resume', capturedId);
                        })
                        .catch(err => console.error("Resume failed:", err));
                });

                btnCancel.addEventListener('click', function handleCancel(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Cancel clicked for download:", capturedId);
                    chrome.downloads.cancel(capturedId)
                        .then(() => {
                            console.log("Cancel successful:", capturedId);
                            notifyBackend('cancel', capturedId);
                        })
                        .catch(err => console.error("Cancel failed:", err));
                });
            }
        }

        // Update backend stats (fire-and-forget)
        updateBackendStats();

    } catch (err) {
        console.error("Error in renderDownloads:", err);
    }

    isRendering = false;
}

