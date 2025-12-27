// ==UserScript==
// @name         YouTube Playlist Blackout
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Blacks out thumbnails of videos from a specific playlist everywhere on YouTube and hides spoiler information.
// @author       Antigravity
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @updateURL    https://raw.githubusercontent.com/wernerbatt/pl-spoiler-block/main/YouTube%20Playlist%20Blackout.user.js
// @downloadURL  https://raw.githubusercontent.com/wernerbatt/pl-spoiler-block/main/YouTube%20Playlist%20Blackout.user.js
// ==/UserScript==

(function () {
    'use strict';

    const PLAYLIST_ID = 'PLISuFiQTdKDWLIeau9w3aVwtiFsKwarBe';
    const blockedVideoIds = new Set();
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
            const regex = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                blockedVideoIds.add(match[1]);
            }
            console.log(`[Blackout] Loaded ${blockedVideoIds.size} unique video IDs to block.`);
            processThumbnails();
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
    // Helper: Rewrite title text (removes scores)
    // ---------------------------------------------------------------------
    function getRewrittenTitle(originalTitle) {
        // Expected format: "| Team A 1-0 Team B |" (pipe‑delimited)
        const match = originalTitle.match(/\|\s*(.*?)\s+\d+-\d+\s+(.*?)\s+\|/);
        if (match) {
            const teamA = match[1].trim();
            const teamB = match[2].trim();
            return `${teamA} vs ${teamB}`;
        }
        return null;
    }

    // ---------------------------------------------------------------------
    // Apply blackout styling and title rewriting to thumbnails.
    // ---------------------------------------------------------------------
    function processThumbnails() {
        if (blockedVideoIds.size === 0) return;

        // -------------------------------------------------------------
        // 1️⃣  Standard Video Links (Home, Search, Playlist)
        // -------------------------------------------------------------
        const links = document.querySelectorAll(`a#thumbnail, a.ytd-thumbnail, a[href*="${PLAYLIST_ID}"]`);
        links.forEach(link => {
            if (link.dataset.blackoutProcessed) return;
            const href = link.getAttribute('href');
            if (!href) return;

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

            if (videoId && blockedVideoIds.has(videoId)) {
                // Blackout the thumbnail container
                link.style.filter = 'brightness(0)';
                link.style.backgroundColor = 'black';
                // Hide any overlay within the thumbnail container
                const overlayElements = link.querySelectorAll('.ytThumbnailHoverOverlayViewModelScrim, .ytThumbnailHoverOverlayScrim, .ytThumbnailHoverOverlayViewModelScrim, .ytThumbnailHoverViewModelScrim');
                overlayElements.forEach(o => o.style.display = 'none');
                link.dataset.blackoutProcessed = 'true';
                console.log(`[Blackout] Blacked out video: ${videoId}`);

                // Title rewriting for standard renderers
                const container = link.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-compact-video-renderer');
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
            if (blockedVideoIds.has(videoId)) {
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
        // 4️⃣  Watch Page Title & Tab Title
        // -------------------------------------------------------------
        const currentVideoIdMatch = window.location.href.match(/[?&]v=([^&]+)/);
        if (currentVideoIdMatch && blockedVideoIds.has(currentVideoIdMatch[1])) {
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
        if (!currentVideoIdMatch || !blockedVideoIds.has(currentVideoIdMatch[1])) {
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
    });
})();
