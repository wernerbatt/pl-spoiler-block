// ==UserScript==
// @name         YouTube Playlist Blackout
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Blacks out thumbnails of videos from a specific playlist everywhere on YouTube and hides spoiler information.
// @author       Antigravity
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @updateURL    https://raw.githubusercontent.com/wernerbatt/pl-spoiler-block/main/pl-spoiler-block.user.js
// @downloadURL  https://raw.githubusercontent.com/wernerbatt/pl-spoiler-block/main/pl-spoiler-block.user.js
// ==/UserScript==

(function () {
    'use strict';

    const PLAYLIST_ID = 'PLISuFiQTdKDWLIeau9w3aVwtiFsKwarBe';
    const blockedVideoIds = new Set();
    let blockedChannelId = null;
    let blockedChannelHandle = null;
    let isFetching = false;

    // ---------------------------------------------------------------------
    // Fetch the playlist page and extract all video IDs that belong to it.
    // ---------------------------------------------------------------------
    async function fetchBlockedVideos() {
        if (isFetching) return;
        isFetching = true;
        console.log('[Blackout] Fetching playlist data...');
        try {
            const response = await fetch(`https://www.youtube.com/playlist?list=${PLAYLIST_ID}`);
            const text = await response.text();

            // Extract channel ID and handle
            const channelIdMatch = text.match(/"channelId":"([^"]+)"/);
            if (channelIdMatch) {
                blockedChannelId = channelIdMatch[1];
                console.log(`[Blackout] Found channel ID: ${blockedChannelId}`);
            }

            const channelHandleMatch = text.match(/"ownerBadges"[\s\S]*?"canonicalBaseUrl":"\/(@[^"]+)"/);
            if (channelHandleMatch) {
                blockedChannelHandle = channelHandleMatch[1];
                console.log(`[Blackout] Found channel handle: ${blockedChannelHandle}`);
            }

            // Extract video IDs
            const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                blockedVideoIds.add(match[1]);
            }
            console.log(`[Blackout] Loaded ${blockedVideoIds.size} unique video IDs to block.`);

            // Process immediately to catch any elements already on the page
            processThumbnails();

            // Single retry to catch elements that loaded during the fetch
            setTimeout(processThumbnails, 500);
        } catch (e) {
            console.error('[Blackout] Error fetching playlist:', e);
        } finally {
            isFetching = false;
        }
    }

    // ---------------------------------------------------------------------
    // Apply blackout styling and title rewriting to thumbnails.
    // ---------------------------------------------------------------------
    // ---------------------------------------------------------------------
    // Helper: Check if element belongs to blocked channel
    // ---------------------------------------------------------------------
    function isBlockedChannel(element) {
        if (!blockedChannelId && !blockedChannelHandle) return false;

        // Look for channel links in the element
        const channelLinks = element.querySelectorAll('a[href*="/channel/"], a[href*="/@"]');
        for (const link of channelLinks) {
            const href = link.getAttribute('href');
            if (!href) continue;

            // Check channel ID
            if (blockedChannelId && href.includes(`/channel/${blockedChannelId}`)) {
                return true;
            }

            // Check channel handle
            if (blockedChannelHandle && href.includes(blockedChannelHandle)) {
                return true;
            }
        }

        return false;
    }

    // ---------------------------------------------------------------------
    // Helper: Rewrite title text (removes scores)
    // ---------------------------------------------------------------------
    function getRewrittenTitle(originalTitle) {
        // Split by pipes to get segments
        const parts = originalTitle.split('|');

        // Look for the segment containing the score (Team A score Team B)
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            // Match: "Team A 1-2 Team B" format
            const match = part.match(/^(.+) ([0-9]+-[0-9]+) (.+)$/);
            if (match) {
                const teamA = match[1].trim();
                const teamB = match[3].trim();
                return `${teamA} vs ${teamB}`;
            }
        }

        return null;
    }

    // ---------------------------------------------------------------------
    // Apply blackout styling and title rewriting to thumbnails.
    // ---------------------------------------------------------------------
    function processThumbnails() {
        // Only skip if we have no channel info AND no video IDs
        if (blockedVideoIds.size === 0 && !blockedChannelId && !blockedChannelHandle) return;

        // -------------------------------------------------------------
        // 1️⃣  Standard Video Links (Home, Search, Playlist)
        // -------------------------------------------------------------
        const links = document.querySelectorAll(`a#thumbnail, a.ytd-thumbnail, a[href*="${PLAYLIST_ID}"]`);
        links.forEach(link => {
            if (link.dataset.blackoutProcessed) return;
            const href = link.getAttribute('href');
            if (!href) return;

            // Skip wc-endpoint wrapper links (playlist panel)
            if (link.id === 'wc-endpoint') return;

            // Check if this is a thumbnail link (contains image or has specific class/id)
            // We do NOT want to blackout text links like #video-title
            const isThumbnail = link.id === 'thumbnail' ||
                link.classList.contains('ytd-thumbnail') ||
                link.querySelector('img') !== null ||
                link.querySelector('.yt-core-image') !== null;

            if (!isThumbnail) return;

            // -------------------------------------------------------------
            // 1️⃣  Standard Video Links (Home, Search, Playlist)
            // -------------------------------------------------------------
            let videoId = null;
            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (vMatch) {
                videoId = vMatch[1];
            } else {
                const shortsMatch = href.match(/\/shorts\/([^/?]+)/);
                if (shortsMatch) videoId = shortsMatch[1];
            }

            // Check if this video should be blocked (by ID or by channel)
            const container = link.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-compact-video-renderer');
            const shouldBlock = (videoId && blockedVideoIds.has(videoId)) || (container && isBlockedChannel(container));

            if (shouldBlock) {
                // Blackout the thumbnail container
                link.style.filter = 'brightness(0)';
                link.style.backgroundColor = 'black';
                // Hide any overlay within the thumbnail container
                const overlayElements = link.querySelectorAll('.ytThumbnailHoverOverlayViewModelScrim, .ytThumbnailHoverOverlayScrim, .ytThumbnailHoverOverlayViewModelScrim, .ytThumbnailHoverViewModelScrim');
                overlayElements.forEach(o => o.style.display = 'none');
                link.dataset.blackoutProcessed = 'true';
                console.log(`[Blackout] Blacked out video: ${videoId || 'unknown'}`);

                // Title rewriting for standard renderers
                if (container) {
                    const titleEl = container.querySelector('#video-title');
                    if (titleEl && !titleEl.dataset.titleProcessed) {
                        const newTitle = getRewrittenTitle(titleEl.textContent.trim());
                        if (newTitle) {
                            titleEl.textContent = newTitle;
                            titleEl.title = newTitle;
                            titleEl.dataset.titleProcessed = 'true';
                        }
                    }
                }
                return;
            }

            // Playlist thumbnail handling
            const listMatch = href.match(/[?&]list=([^&]+)/);
            if (listMatch && listMatch[1] === PLAYLIST_ID) {
                // Double check it's a thumbnail (redundant but safe)
                if (isThumbnail) {
                    link.style.filter = 'brightness(0)';
                    link.style.backgroundColor = 'black';
                    const overlayElementsPl = link.querySelectorAll('.ytThumbnailHoverOverlayViewModelScrim, .ytThumbnailHoverViewModelScrim');
                    overlayElementsPl.forEach(o => o.style.display = 'none');
                    link.dataset.blackoutProcessed = 'true';
                }
            }
        });

        // -------------------------------------------------------------
        // 2️⃣  Suggested Videos (yt-lockup-view-model)
        // -------------------------------------------------------------
        const lockups = document.querySelectorAll('yt-lockup-view-model');
        lockups.forEach(lockup => {
            if (lockup.dataset.blackoutProcessed) return;

            // Check if this lockup links to a blocked video
            const link = lockup.querySelector('a[href*="/watch?v="]');
            if (!link) return;

            const href = link.getAttribute('href');
            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (!vMatch) return;

            const videoId = vMatch[1];
            const shouldBlock = blockedVideoIds.has(videoId) || isBlockedChannel(lockup);

            if (shouldBlock) {
                // Blackout thumbnail
                const thumb = lockup.querySelector('yt-thumbnail-view-model img, .yt-lockup-view-model__content-image');
                if (thumb) {
                    thumb.style.filter = 'brightness(0)';
                    thumb.style.backgroundColor = 'black';
                }

                // Rewrite Title
                const titleEl = lockup.querySelector('.yt-lockup-metadata-view-model__title span, h3 a');
                if (titleEl) {
                    const newTitle = getRewrittenTitle(titleEl.textContent.trim());
                    if (newTitle) {
                        titleEl.textContent = newTitle;
                        // Also update the link title attribute if present
                        const titleLink = lockup.querySelector('a.yt-lockup-metadata-view-model__title');
                        if (titleLink) titleLink.title = newTitle;
                    }
                }

                lockup.dataset.blackoutProcessed = 'true';
                console.log(`[Blackout] Processed suggested video: ${videoId}`);
            }
        });

        // -------------------------------------------------------------
        // 3️⃣  Playlist Header
        // -------------------------------------------------------------
        const headerThumbImgs = document.querySelectorAll(
            'ytd-playlist-header-renderer ytd-thumbnail img,' +
            'ytd-playlist-header-renderer yt-img-shadow img,' +
            'ytd-playlist-header-renderer img,' +
            'ytd-hero-playlist-thumbnail-renderer img,' +
            'yt-content-preview-image-view-model img'
        );
        headerThumbImgs.forEach(img => {
            if (window.location.href.includes(PLAYLIST_ID)) {
                img.style.filter = 'brightness(0)';
                img.style.backgroundColor = 'black';
            }
        });

        // -------------------------------------------------------------
        // 4️⃣  YouTube End Screen Cards (Info Cards/Playlist Cards)
        // -------------------------------------------------------------
        const endScreenCards = document.querySelectorAll('.ytp-ce-playlist, .ytp-ce-video');
        endScreenCards.forEach(card => {
            if (card.dataset.blackoutProcessed) return;

            const link = card.querySelector('a');
            if (!link) return;

            const href = link.getAttribute('href');
            let shouldBlackout = false;

            // Check if it's a playlist card
            if (href && href.includes(PLAYLIST_ID)) {
                shouldBlackout = true;
            }

            // Check if it's a video card with a blocked video ID
            if (!shouldBlackout && href) {
                const vMatch = href.match(/[?&]v=([^&]+)/);
                if (vMatch && blockedVideoIds.has(vMatch[1])) {
                    shouldBlackout = true;
                }
            }

            if (shouldBlackout) {
                // Black out the covering image (thumbnail)
                const coveringImage = card.querySelector('.ytp-ce-covering-image');
                if (coveringImage) {
                    coveringImage.style.filter = 'brightness(0)';
                    coveringImage.style.backgroundColor = 'black';
                }
                card.dataset.blackoutProcessed = 'true';
                console.log('[Blackout] Blacked out end screen card');
            }
        });

        // -------------------------------------------------------------
        // 5️⃣  Video Wall Suggestions (Suggested Videos Overlay)
        // -------------------------------------------------------------
        const videowallStills = document.querySelectorAll('.ytp-videowall-still, .ytp-modern-videowall-still');
        videowallStills.forEach(still => {
            if (still.dataset.blackoutProcessed) return;

            const href = still.getAttribute('href');
            if (!href) return;

            // Extract video ID
            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (!vMatch) return;
            const videoId = vMatch[1];
            const shouldBlock = blockedVideoIds.has(videoId) || isBlockedChannel(still);

            if (shouldBlock) {
                // Black out the image
                const image = still.querySelector('img, .ytp-videowall-still-image');
                if (image) {
                    image.style.filter = 'brightness(0)';
                    image.style.backgroundColor = 'black';
                }

                // Rewrite the title
                const titleEl = still.querySelector('.ytp-videowall-still-info-title');
                if (titleEl) {
                    const newTitle = getRewrittenTitle(titleEl.textContent.trim());
                    if (newTitle) {
                        titleEl.textContent = newTitle;
                    }
                }

                still.dataset.blackoutProcessed = 'true';
                console.log('[Blackout] Blacked out video wall suggestion');
            }
        });

        // -------------------------------------------------------------
        // 6️⃣  Playlist Panel Videos (Right Side Panel)
        // -------------------------------------------------------------
        const playlistPanelVideos = document.querySelectorAll('ytd-playlist-panel-video-renderer');
        playlistPanelVideos.forEach(video => {
            const wcEndpoint = video.querySelector('a#wc-endpoint');
            if (!wcEndpoint) return;

            const href = wcEndpoint.getAttribute('href');
            if (!href || !href.includes(PLAYLIST_ID)) return;

            // Extract video ID
            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (!vMatch) return;
            const videoId = vMatch[1];
            const shouldBlock = blockedVideoIds.has(videoId) || isBlockedChannel(video);

            if (shouldBlock) {
                // Black out only the thumbnail, not the wrapper
                const thumbnail = video.querySelector('a#thumbnail');
                if (thumbnail && !thumbnail.dataset.blackoutProcessed) {
                    thumbnail.style.filter = 'brightness(0)';
                    thumbnail.style.backgroundColor = 'black';
                    thumbnail.dataset.blackoutProcessed = 'true';
                }

                // Rewrite the title
                const titleEl = video.querySelector('#video-title');
                if (titleEl && !titleEl.dataset.titleProcessed) {
                    const newTitle = getRewrittenTitle(titleEl.textContent.trim());
                    if (newTitle) {
                        titleEl.textContent = newTitle;
                        if (titleEl.hasAttribute('title')) {
                            titleEl.setAttribute('title', newTitle);
                        }
                        if (titleEl.hasAttribute('aria-label')) {
                            const ariaLabel = titleEl.getAttribute('aria-label');
                            const newAriaLabel = getRewrittenTitle(ariaLabel);
                            if (newAriaLabel) {
                                titleEl.setAttribute('aria-label', newAriaLabel);
                            }
                        }
                        titleEl.dataset.titleProcessed = 'true';
                        console.log(`[Blackout] Rewrote playlist panel title: "${newTitle}"`);
                    }
                }
            }
        });

        // -------------------------------------------------------------
        // 7️⃣  Watch Page Title & Tab Title
        // -------------------------------------------------------------
        const currentVideoIdMatch = window.location.href.match(/[?&]v=([^&]+)/);
        const watchMetadata = document.querySelector('ytd-watch-metadata');
        const isBlockedWatchPage = (currentVideoIdMatch && blockedVideoIds.has(currentVideoIdMatch[1])) ||
                                    (watchMetadata && isBlockedChannel(watchMetadata));

        if (isBlockedWatchPage) {
            // Main Page Title
            const watchTitleEl = document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string, ytd-watch-metadata #title h1');
            if (watchTitleEl && !watchTitleEl.dataset.titleProcessed) {
                const newTitle = getRewrittenTitle(watchTitleEl.textContent.trim());
                if (newTitle) {
                    watchTitleEl.textContent = newTitle;
                    watchTitleEl.title = newTitle;
                    watchTitleEl.dataset.titleProcessed = 'true';
                    console.log(`[Blackout] Updated watch page title: "${newTitle}"`);
                }
            }

            // Browser Tab Title - Enforce via check
            handleTabTitle();
        }
    }

    // ---------------------------------------------------------------------
    // Handle Browser Tab Title (Persistent Enforcement)
    // ---------------------------------------------------------------------
    let titleObserver = null;
    function handleTabTitle() {
        const currentVideoIdMatch = window.location.href.match(/[?&]v=([^&]+)/);
        const watchMetadata = document.querySelector('ytd-watch-metadata');
        const isBlockedWatchPage = (currentVideoIdMatch && blockedVideoIds.has(currentVideoIdMatch[1])) ||
                                    (watchMetadata && isBlockedChannel(watchMetadata));

        if (!isBlockedWatchPage) {
            if (titleObserver) {
                titleObserver.disconnect();
                titleObserver = null;
            }
            return;
        }

        const updateTitle = () => {
            const currentTitle = document.title;
            // Check if title needs rewriting (contains pipe format with score)
            // We check for the pattern even if it has a prefix like "(1)"
            if (currentTitle.match(/\|\s*.*?\s+\d+-\d+\s+.*?\s+\|/)) {
                const newTitle = getRewrittenTitle(currentTitle);
                if (newTitle && !currentTitle.startsWith(newTitle)) {
                    document.title = `${newTitle} - YouTube`;
                    console.log(`[Blackout] Enforced tab title: "${newTitle} - YouTube"`);
                }
            }
        };

        // Run immediately
        updateTitle();

        // Setup observer if not already running
        if (!titleObserver) {
            const titleElement = document.querySelector('title');
            if (titleElement) {
                titleObserver = new MutationObserver(() => {
                    updateTitle();
                });
                titleObserver.observe(titleElement, { childList: true, subtree: true, characterData: true });
            }
        }
    }

    // Observe DOM changes to handle infinite scroll and SPA navigation.
    // ---------------------------------------------------------------------
    const observer = new MutationObserver(() => {
        processThumbnails();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial data fetch
    fetchBlockedVideos();

    // Re‑run on YouTube SPA navigation events
    window.addEventListener('yt-navigate-finish', () => {
        processThumbnails();
        // Single retry for late-loading elements
        setTimeout(processThumbnails, 300);
    });
})();
