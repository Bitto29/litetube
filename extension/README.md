# LiteTube Speed Bridge

This optional Chrome/Edge extension lets LiteTube's existing speed selector apply playback speeds up to **4×** to the real video element inside the YouTube embed. LiteTube keeps using the normal YouTube player. It does not download or proxy video streams.

## Why an extension is needed

The YouTube iframe is cross-origin, so LiteTube's site JavaScript cannot directly access its internal video element. The official YouTube iframe player normally exposes speeds up to 2×. The extension runs a content script inside the matching YouTube iframe and applies the selected rate to the native `HTMLMediaElement.playbackRate`.

## Install or update in Chrome or Edge

1. Download the LiteTube repository ZIP from https://github.com/Bitto29/litetube/archive/refs/heads/main.zip and extract it.
2. Open `chrome://extensions` (in Edge, use `edge://extensions`).
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted `extension` folder. To update an existing install, open its card and click **Reload**.
5. Refresh the same LiteTube address you normally use with **Ctrl + Shift + R**. Supported addresses include https://litetube29.vercel.app/ and https://litetube-xi.vercel.app/.
6. Play a video, then choose **2.25×, 2.5×, 2.75×, 3×, 3.5×, or 4×** from the normal speed selector.

## Notes

- Keep using the same LiteTube domain where your saved links already appear. Saved links are stored locally by the browser and are separate for each site origin.
- The extension only changes the speed of a video that the embedded YouTube player is already able to play. It does not bypass YouTube sign-in checks, DRM, private-video restrictions, or regional restrictions.
- If speeds above 2× are selected without the extension, LiteTube keeps the selected speed but the YouTube player remains capped at its native limit and displays an **Enable 4×** link.
- After updating the extension files, reload the extension on `chrome://extensions` / `edge://extensions`, then refresh LiteTube.
