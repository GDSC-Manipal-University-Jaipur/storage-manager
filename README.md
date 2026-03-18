# Disk Space Checker

A simple browser extension that pauses your downloads if you're about to run out of disk space. It works safely in the background using Native Messaging.

## Discord Community
Join our channel `linux-storage-extension` to discuss or contribute!
**Link**: https://discord.gg/AVQyybhQ

---

## 🚀 Quick Start Guide

### Step 1: Add the Extension to your Browser
1. Open your browser's extension page:
   - **Chrome**: `chrome://extensions/`
   - **Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
2. Turn on **Developer mode** (usually a toggle in the top-right).
3. Click **"Load unpacked"**.
4. Select the `extension` folder from this project.
5. **Copy the Extension ID** that appears on the screen (you'll need it).

### Step 2: Install the Background Checker
The extension needs a small background script to securely check your hard drive space.

1. Open a terminal or command prompt.
2. Go to the `scripts` folder in this project:
   ```bash
   cd path/to/storage-manager/scripts
   ```
3. Run the setup script using the **Extension ID** you copied earlier:
   - **Windows**: `install_host.bat <your-extension-id>`
   - **Mac/Linux**: `./install_native_host.sh <your-extension-id>`
4. **Restart your browser.**

You're done! 🎉 

---

## 🛠️ How It Works

Whenever you start a download:
1. The extension **automatically pauses** it.
2. A popup appears showing your **available disk space**.
3. If there's enough space, click **Confirm** to resume the download.
4. If you're low on space, click **Cancel**.

### Safety Buffer
By default, the checker ensures you always have at least **5GB** of free space remaining. You can change this in `native-host/native_host.py`.

---

## 📚 More Information

Need help, or want to dive deeper? Check our docs:
- 🐞 [Troubleshooting & Known Issues](docs/KNOWN_ISSUES.md)
- 🧪 [Testing Guide](docs/TESTING.md)
- 🤝 [How to Contribute](docs/contributing.md)
