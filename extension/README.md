# LiteTube Speed Bridge

This optional Chrome/Edge extension lets LiteTube's existing speed selector apply speeds up to **4x** to the actual video element inside the YouTube embed.

## Why an extension is needed

The YouTube iframe is cross-origin, so LiteTube's site JavaScript cannot directly access its internal video element. Public API mirrors also block or rate-limit the server-side stream extractor. The extension runs a content script in the matching YouTube iframe and changes the native `HTMLMediaElement.playbackRate` value instead of downloading or proxying the video.

## Install in Chrome or Edge

1. Download the LiteTube repository ZIP from https://github.com/Bitto29/litetube/archive/refs/heads/main.zip and extract it.
2. Open `chrome://extensions` (in Edge, use `edge://extensions`).
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted `extension` folder.
5. Reload https://litetube29.vercel.app/ using **Ctrl + Shift + R**.
6. Start a video and choose 2.25x, 2.5x, 2.75x, 3x, 3.5x, or 4x from LiteTube's speed selector.

## Notes

- This version is explicitly scoped to `litetube29.vercel.app` and `www.youtube-nocookie.com`.
- The extension does not defeat login checks, DRM, or video access restrictions. It only changes playback speed of a video that the embedded YouTube player is already playing.
- If you use another LiteTube domain, the extension manifest's host permissions and content-script match must be updated.
- If the site has changed, reload the unpacked extension on `chrome://extensions` and refresh LiteTube.
