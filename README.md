# YouTube Playlist Blackout

A Tampermonkey userscript that blacks out video thumbnails from a specific YouTube playlist and hides spoiler information (like sports scores) across all of YouTube.

## Features

- **Thumbnail Blackout**: Completely blacks out thumbnails of videos from a specified playlist
- **Spoiler Protection**: Rewrites video titles to hide scores (e.g., "| Team A 1-0 Team B |" becomes "Team A vs Team B")
- **Comprehensive Coverage**: Works across:
  - YouTube home page
  - Search results
  - Playlist pages
  - Suggested videos sidebar
  - Watch page titles
  - Browser tab titles
- **Dynamic Updates**: Handles YouTube's infinite scroll and SPA navigation automatically

## Installation

### Prerequisites

Install [Tampermonkey](https://www.tampermonkey.net/) extension for your browser:
- [Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

### Install from GitHub (Recommended)

1. Click this link to install: [pl-spoiler-block.user.js](https://raw.githubusercontent.com/wernerbatt/pl-spoiler-block/main/pl-spoiler-block.user.js)
2. Tampermonkey will open and show the installation page
3. Click "Install"

The script will automatically check for updates from GitHub.

### Manual Installation

1. Download `pl-spoiler-block.user.js`
2. Open Tampermonkey dashboard
3. Click the "+" tab to create a new script
4. Paste the script content
5. Click File > Save (or Ctrl+S)

## Configuration

By default, the script is configured for a specific playlist. To customize:

1. Open Tampermonkey dashboard
2. Click the edit icon next to "YouTube Playlist Blackout"
3. Find line 15: `const PLAYLIST_ID = 'PLISuFiQTdKDWLIeau9w3aVwtiFsKwarBe';`
4. Replace the playlist ID with your desired playlist
   - You can find the playlist ID in the URL: `youtube.com/playlist?list=YOUR_PLAYLIST_ID`
5. Save the script (Ctrl+S)

## How It Works

1. **Fetches Video IDs**: On page load, the script fetches all video IDs from the specified playlist
2. **Monitors Page Changes**: Uses MutationObserver to watch for new content (infinite scroll, navigation)
3. **Processes Thumbnails**: When matching videos are found, it:
   - Applies `brightness(0)` filter to make thumbnails completely black
   - Hides thumbnail overlays
   - Rewrites titles to remove score information
4. **Tab Title Protection**: Continuously monitors and updates the browser tab title to prevent spoilers

## Title Rewriting

The script specifically looks for titles in this format:
```
| Team A 1-0 Team B |
```

And rewrites them to:
```
Team A vs Team B
```

This prevents seeing the final score while browsing YouTube.

## Troubleshooting

### Thumbnails aren't being blacked out
- Make sure you've configured the correct playlist ID
- Check the browser console (F12) for `[Blackout]` messages
- Verify Tampermonkey is enabled for YouTube

### Titles still show scores
- The script expects titles in the format `| Team A 1-0 Team B |`
- If your titles use a different format, you may need to adjust the regex pattern in the `getRewrittenTitle()` function

### Script not updating automatically
- Verify the `@updateURL` and `@downloadURL` in the script header point to your GitHub repository
- Check Tampermonkey settings for update frequency

## Development

### Local Testing

1. Make changes to the script
2. Save in Tampermonkey
3. Refresh YouTube to test

### Publishing Updates

After pushing changes to GitHub:
1. Increment the `@version` number in the script header
2. Users will automatically receive updates based on their Tampermonkey settings

## License

MIT License - Feel free to modify and distribute

## Credits

Author: Antigravity
