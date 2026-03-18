// ============================================================
// Storage Manager popup — all native messaging goes through
// one host: com.storagemanager.app
// ============================================================

// Track which download IDs have event listeners attached
const attachedListeners = new Set();

// Flag to prevent concurrent renders
let isRendering = false;

// Polling interval handles
let downloadPollInterval;
let statsPollInterval;

// ============================================================
// Init
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    loadDiskInfo("/");
    startDownloadPolling();
    startStatsPolling();
});

// ============================================================
// Native messaging helper
// Uses "action" key — native_app.py accepts both "action" and "command"
// ============================================================

function sendNativeMessage(action, params = {}) {
    return new Promise((resolve, reject) => {
        const message = { action, ...params };

        chrome.runtime.sendNativeMessage("com.storagemanager.app", message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || "Native host connection failed"));
                return;
            }
            if (!response) {
                reject(new Error("No response from native host"));
                return;
            }
            if (response.ok === false) {
                reject(new Error(response.error || "Unknown error"));
            } else {
                resolve(response);
            }
        });
    });
}

// ============================================================
// Disk info
// ============================================================

async function loadDiskInfo(path) {
    const diskInfoDiv = document.getElementById("diskInfo");
    diskInfoDiv.innerHTML = '<div class="loading">Loading disk space...</div>';

    try {
        const data = await sendNativeMessage("info", { path });

        const percentFree = 100 - data.percent_used;
        let colorClass = "high";
        if (percentFree < 10) colorClass = "low";
        else if (percentFree < 25) colorClass = "medium";

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
                Could not load disk space info.<br>
                <small>Make sure native host is installed</small>
            </div>
        `;
    }
}

// ============================================================
// Download manager — polling
// ============================================================

function startDownloadPolling() {
    renderDownloads();
    downloadPollInterval = setInterval(renderDownloads, 800);
}

async function renderDownloads() {
    if (isRendering) return;
    isRendering = true;

    try {
        const allDownloads = await chrome.downloads.search({});

        const activeDownloads = allDownloads.filter(dl =>
            dl.state === "in_progress" ||
            (dl.state === "interrupted" && dl.canResume)
        );

        const listDiv    = document.getElementById("downloadsList");
        const emptyState = document.getElementById("managerEmptyState");
        const template   = document.getElementById("downloadItemTemplate");

        if (activeDownloads.length === 0) {
            emptyState.style.display = "flex";
            listDiv.style.display    = "none";
            listDiv.innerHTML        = "";
            attachedListeners.clear();
            isRendering = false;
            return;
        }

        emptyState.style.display = "none";
        listDiv.style.display    = "flex";

        // Remove stale items
        const activeIds = new Set(activeDownloads.map(dl => String(dl.id)));
        listDiv.querySelectorAll(".download-item").forEach(item => {
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
                itemDiv = clone.querySelector(".download-item");
                itemDiv.setAttribute("data-dlid", dlIdStr);
                listDiv.appendChild(itemDiv);
            }

            // File name
            const dlName = dl.filename
                ? dl.filename.split(/[\\\/]/).pop()
                : (dl.url || "Unknown");
            const nameEl = itemDiv.querySelector(".dl-name");
            nameEl.textContent = dlName;
            nameEl.title = dl.filename || dl.url || "";

            // Progress
            let progress = 0;
            const downloadedStr = formatBytes(dl.bytesReceived);
            let totalStr = "Unknown size";

            if (dl.totalBytes > 0) {
                progress = (dl.bytesReceived / dl.totalBytes) * 100;
                totalStr = formatBytes(dl.totalBytes);
            }

            itemDiv.querySelector(".dl-progress-fill").style.width = progress.toFixed(1) + "%";

            const sizeEl = itemDiv.querySelector(".dl-size");
            sizeEl.textContent = dl.totalBytes > 0
                ? `${downloadedStr} / ${totalStr} (${progress.toFixed(1)}%)`
                : `${downloadedStr} / ${totalStr}`;

            // Status + buttons
            const statusSpan = itemDiv.querySelector(".dl-status");
            const btnPause   = itemDiv.querySelector(".dl-btn-pause");
            const btnResume  = itemDiv.querySelector(".dl-btn-resume");
            const btnCancel  = itemDiv.querySelector(".dl-btn-cancel");
            const fillEl     = itemDiv.querySelector(".dl-progress-fill");

            if (dl.paused || dl.state === "interrupted") {
                statusSpan.textContent  = dl.state === "interrupted" ? "Interrupted" : "Paused";
                fillEl.classList.add("paused");
                btnPause.style.display  = "none";
                btnResume.style.display = "flex";
                btnCancel.style.display = "flex";
            } else {
                statusSpan.textContent  = "Downloading";
                fillEl.classList.remove("paused");
                btnPause.style.display  = "flex";
                btnResume.style.display = "none";
                btnCancel.style.display = "flex";
            }

            // Attach event listeners only once per download
            if (!attachedListeners.has(dlIdStr)) {
                attachedListeners.add(dlIdStr);
                const id = dl.id;

                btnPause.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    chrome.downloads.pause(id)
                        .then(() => notifyBackend("pause", id))
                        .catch(err => console.error("Pause failed:", err));
                });

                btnResume.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    chrome.downloads.resume(id)
                        .then(() => notifyBackend("resume", id))
                        .catch(err => console.error("Resume failed:", err));
                });

                btnCancel.addEventListener("click", (e) => {
                    e.preventDefault(); e.stopPropagation();
                    chrome.downloads.cancel(id)
                        .then(() => notifyBackend("cancel", id))
                        .catch(err => console.error("Cancel failed:", err));
                });
            }
        }
    } catch (err) {
        console.error("Error in renderDownloads:", err);
    }

    isRendering = false;
}

// ============================================================
// Backend stats counter — dedicated polling, every 2 seconds
// ============================================================

function startStatsPolling() {
    updateBackendStats();                                    // immediate first read
    statsPollInterval = setInterval(updateBackendStats, 2000); // then every 2 s
}

function updateBackendStats() {
    sendNativeMessage("get_stats")
        .then(data => {
            if (data && data.stats) {
                const sp = document.getElementById("statPause");
                const sr = document.getElementById("statResume");
                const sc = document.getElementById("statCancel");
                if (sp) sp.textContent = data.stats.pause  ?? 0;
                if (sr) sr.textContent = data.stats.resume ?? 0;
                if (sc) sc.textContent = data.stats.cancel ?? 0;
            }
        })
        .catch(() => { /* native host not available — counters stay at 0 */ });
}

// Fire-and-forget: record pause/resume/cancel in stats.json
function notifyBackend(action, id) {
    sendNativeMessage(action, { id }).catch(() => {});
}

// ============================================================
// Utilities
// ============================================================

function formatBytes(bytes) {
    if (!bytes || bytes <= 0)         return "0 B";
    if (bytes < 1024)                 return bytes + " B";
    if (bytes < 1024 * 1024)          return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024)   return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function showError(message) {
    const errorDiv = document.getElementById("errorMessage");
    if (!errorDiv) return;
    errorDiv.textContent = message;
    errorDiv.classList.add("show");
    setTimeout(() => errorDiv.classList.remove("show"), 5000);
}
