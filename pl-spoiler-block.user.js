// ==UserScript==
// @name         YouTube Playlist Blackout
// @namespace    http://tampermonkey.net/
// @version      1.12
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
    // CSS injection: black out videowall cards instantly as YouTube renders
    // them, before any script callback has a chance to run.
    // We key rules on [href*="v=ID"] so they apply the moment the element
    // is inserted into the DOM — no MutationObserver delay.
    // ---------------------------------------------------------------------
    const blackoutStyle = document.createElement('style');
    document.head.appendChild(blackoutStyle);

    function updateBlockedCSS() {
        if (blockedVideoIds.size === 0) return;
        const ids = Array.from(blockedVideoIds);
        // Only black out the thumbnail image, not the whole card —
        // the title text is rewritten separately by processThumbnails.
        const imageSelectors = ids.flatMap(id => [
            `.ytp-videowall-still[href*="v=${id}"] .ytp-videowall-still-image`,
            `.ytp-modern-videowall-still[href*="v=${id}"] .ytp-videowall-still-image`,
        ]).join(',\n');
        blackoutStyle.textContent = `
${imageSelectors} {
    filter: brightness(0) !important;
    background-color: black !important;
}`;
        console.log(`[Blackout] Injected CSS for ${ids.length} video IDs`);
    }

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

            // Inject CSS immediately so videowall cards are blacked out
            // the instant YouTube renders them — no script-timing delay.
            updateBlockedCSS();

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
    // Helper: Check if a title looks like a PL match highlights video
    // (catches highlights from any channel, not just the blocked one)
    // ---------------------------------------------------------------------
    function isPLHighlight(title) {
        if (!title) return false;
        return /premier league/i.test(title) && /\b\d+-\d+\b/.test(title);
    }

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
        const parts = originalTitle.split('|');
        const candidates = [];

        for (const part of parts) {
            const p = part.trim();
            const match = p.match(/^(.+?) ([0-9]+-[0-9]+) (.+?)$/);
            if (match) {
                candidates.push({ teamA: match[1].trim(), teamB: match[3].trim() });
            }
        }

        if (candidates.length === 0) return null;

        // Prefer the candidate with the shortest combined team names —
        // the actual score segment (e.g. "Brentford 2-2 Wolves") is more
        // concise than editorial blurbs that happen to contain numbers.
        candidates.sort((a, b) =>
            (a.teamA.length + a.teamB.length) - (b.teamA.length + b.teamB.length)
        );

        return `${candidates[0].teamA} vs ${candidates[0].teamB}`;
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

            let videoId = null;
            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (vMatch) {
                videoId = vMatch[1];
            } else {
                const shortsMatch = href.match(/\/shorts\/([^/?]+)/);
                if (shortsMatch) videoId = shortsMatch[1];
            }

            const container = link.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer, ytd-compact-video-renderer');
            const titleEl = container ? container.querySelector('#video-title') : null;
            const titleText = titleEl ? titleEl.textContent.trim() : '';

            const shouldBlock = (videoId && blockedVideoIds.has(videoId)) ||
                                (container && isBlockedChannel(container)) ||
                                isPLHighlight(titleText);

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
                if (titleEl && !titleEl.dataset.titleProcessed) {
                    const newTitle = getRewrittenTitle(titleEl.textContent.trim());
                    if (newTitle) {
                        titleEl.textContent = newTitle;
                        titleEl.title = newTitle;
                        titleEl.dataset.titleProcessed = 'true';
                    }
                }
                return;
            }

            // Playlist thumbnail handling
            const listMatch = href.match(/[?&]list=([^&]+)/);
            if (listMatch && listMatch[1] === PLAYLIST_ID) {
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

            const link = lockup.querySelector('a[href*="/watch?v="]');
            if (!link) return;

            const href = link.getAttribute('href');
            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (!vMatch) return;

            const videoId = vMatch[1];
            const titleEl = lockup.querySelector('.yt-lockup-metadata-view-model__title span, h3 a');
            const titleText = titleEl ? titleEl.textContent.trim() : '';

            const shouldBlock = blockedVideoIds.has(videoId) ||
                                isBlockedChannel(lockup) ||
                                isPLHighlight(titleText);

            if (shouldBlock) {
                // Blackout thumbnail
                const thumb = lockup.querySelector('yt-thumbnail-view-model img, .yt-lockup-view-model__content-image');
                if (thumb) {
                    thumb.style.filter = 'brightness(0)';
                    thumb.style.backgroundColor = 'black';
                }

                // Rewrite Title
                if (titleEl) {
                    const newTitle = getRewrittenTitle(titleEl.textContent.trim());
                    if (newTitle) {
                        titleEl.textContent = newTitle;
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

            if (href && href.includes(PLAYLIST_ID)) {
                shouldBlackout = true;
            }

            if (!shouldBlackout && href) {
                const vMatch = href.match(/[?&]v=([^&]+)/);
                if (vMatch && blockedVideoIds.has(vMatch[1])) {
                    shouldBlackout = true;
                }
            }

            if (!shouldBlackout) {
                const titleEl = card.querySelector('.ytp-ce-video-title, .ytp-ce-playlist-title');
                if (titleEl && isPLHighlight(titleEl.textContent.trim())) {
                    shouldBlackout = true;
                }
            }

            if (shouldBlackout) {
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

            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (!vMatch) return;
            const videoId = vMatch[1];

            const titleEl = still.querySelector('.ytp-videowall-still-info-title');
            const titleText = titleEl ? titleEl.textContent.trim() : '';

            const shouldBlock = blockedVideoIds.has(videoId) ||
                                isBlockedChannel(still) ||
                                isPLHighlight(titleText);

            if (shouldBlock) {
                const image = still.querySelector('img, .ytp-videowall-still-image');
                if (image) {
                    image.style.filter = 'brightness(0)';
                    image.style.backgroundColor = 'black';
                }

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
        // 6️⃣  Search Knowledge Panel (Universal Watch Card)
        // -------------------------------------------------------------
        const watchCards = document.querySelectorAll('ytd-universal-watch-card-renderer');
        watchCards.forEach(card => {
            if (card.dataset.blackoutProcessed) return;

            const cardLinks = card.querySelectorAll('a[href*="watch"]');
            let hasBlockedVideo = false;
            for (const link of cardLinks) {
                const href = link.getAttribute('href') || '';
                const vMatch = href.match(/[?&]v=([^&]+)/);
                if (vMatch && blockedVideoIds.has(vMatch[1])) {
                    hasBlockedVideo = true;
                    break;
                }
            }

            const heroTitleEl = card.querySelector('ytd-watch-card-hero-video-renderer yt-formatted-string');
            const heroTitleText = heroTitleEl ? heroTitleEl.textContent.trim() : '';

            if (!hasBlockedVideo && !isBlockedChannel(card) && !isPLHighlight(heroTitleText)) return;

            const heroImg = card.querySelector('ytd-watch-card-hero-video-renderer img, ytd-single-hero-image-renderer img');
            if (heroImg) {
                heroImg.style.filter = 'brightness(0)';
                heroImg.style.backgroundColor = 'black';
            }

            if (heroTitleEl) {
                const newTitle = getRewrittenTitle(heroTitleEl.textContent.trim());
                if (newTitle) {
                    heroTitleEl.textContent = newTitle;
                    console.log(`[Blackout] Rewrote hero title: "${newTitle}"`);
                }
            }

            card.querySelectorAll('ytd-watch-card-compact-video-renderer').forEach(v => {
                const thumb = v.querySelector('a#thumbnail');
                if (thumb) {
                    thumb.style.filter = 'brightness(0)';
                    thumb.style.backgroundColor = 'black';
                }
                const titleEl = v.querySelector('yt-formatted-string.title');
                if (titleEl) {
                    const newTitle = getRewrittenTitle(titleEl.textContent.trim());
                    if (newTitle) {
                        titleEl.textContent = newTitle;
                    }
                }
            });

            card.dataset.blackoutProcessed = 'true';
        });

        // -------------------------------------------------------------
        // 7️⃣  Playlist Panel Videos (Right Side Panel)
        // -------------------------------------------------------------
        const playlistPanelVideos = document.querySelectorAll('ytd-playlist-panel-video-renderer');
        playlistPanelVideos.forEach(video => {
            const wcEndpoint = video.querySelector('a#wc-endpoint');
            if (!wcEndpoint) return;

            const href = wcEndpoint.getAttribute('href');
            if (!href || !href.includes(PLAYLIST_ID)) return;

            const vMatch = href.match(/[?&]v=([^&]+)/);
            if (!vMatch) return;
            const videoId = vMatch[1];

            const titleEl = video.querySelector('#video-title');
            const titleText = titleEl ? titleEl.textContent.trim() : '';

            const shouldBlock = blockedVideoIds.has(videoId) ||
                                isBlockedChannel(video) ||
                                isPLHighlight(titleText);

            if (shouldBlock) {
                const thumbnail = video.querySelector('a#thumbnail');
                if (thumbnail && !thumbnail.dataset.blackoutProcessed) {
                    thumbnail.style.filter = 'brightness(0)';
                    thumbnail.style.backgroundColor = 'black';
                    thumbnail.dataset.blackoutProcessed = 'true';
                }

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
        // 8️⃣  Watch Page Title & Tab Title
        // -------------------------------------------------------------
        const currentVideoIdMatch = window.location.href.match(/[?&]v=([^&]+)/);
        const watchMetadata = document.querySelector('ytd-watch-metadata');
        const watchTitleEl = document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string, ytd-watch-metadata #title h1');
        const watchTitleText = watchTitleEl ? watchTitleEl.textContent.trim() : '';

        const isBlockedWatchPage = (currentVideoIdMatch && blockedVideoIds.has(currentVideoIdMatch[1])) ||
                                    (watchMetadata && isBlockedChannel(watchMetadata)) ||
                                    isPLHighlight(watchTitleText);

        if (isBlockedWatchPage) {
            if (watchTitleEl && !watchTitleEl.dataset.titleProcessed) {
                const newTitle = getRewrittenTitle(watchTitleEl.textContent.trim());
                if (newTitle) {
                    watchTitleEl.textContent = newTitle;
                    watchTitleEl.title = newTitle;
                    watchTitleEl.dataset.titleProcessed = 'true';
                    console.log(`[Blackout] Updated watch page title: "${newTitle}"`);
                }
            }

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
        const watchTitleEl = document.querySelector('ytd-watch-metadata #title h1 yt-formatted-string, ytd-watch-metadata #title h1');
        const watchTitleText = watchTitleEl ? watchTitleEl.textContent.trim() : '';

        const isBlockedWatchPage = (currentVideoIdMatch && blockedVideoIds.has(currentVideoIdMatch[1])) ||
                                    (watchMetadata && isBlockedChannel(watchMetadata)) ||
                                    isPLHighlight(watchTitleText);

        if (!isBlockedWatchPage) {
            if (titleObserver) {
                titleObserver.disconnect();
                titleObserver = null;
            }
            return;
        }

        const updateTitle = () => {
            const currentTitle = document.title;
            if (currentTitle.match(/\|\s*.*?\s+\d+-\d+\s+.*?\s+\|/)) {
                const newTitle = getRewrittenTitle(currentTitle);
                if (newTitle && !currentTitle.startsWith(newTitle)) {
                    document.title = `${newTitle} - YouTube`;
                    console.log(`[Blackout] Enforced tab title: "${newTitle} - YouTube"`);
                }
            }
        };

        updateTitle();

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
    const observer = new MutationObserver(() => {
        processThumbnails();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial data fetch
    fetchBlockedVideos();

    // Re‑run on YouTube SPA navigation events
    window.addEventListener('yt-navigate-finish', () => {
        processThumbnails();
        setTimeout(processThumbnails, 300);
        // Attach ended listener each time we navigate to a watch page
        attachVideoEndedListener();
    });

    // Fire processThumbnails rapidly when the video ends so the videowall
    // is blacked out before the user can see it.
    function attachVideoEndedListener() {
        const video = document.querySelector('video.html5-main-video');
        if (!video || video.dataset.blackoutEndedListened) return;
        video.dataset.blackoutEndedListened = 'true';
        video.addEventListener('ended', () => {
            processThumbnails();
            setTimeout(processThumbnails, 100);
            setTimeout(processThumbnails, 300);
            setTimeout(processThumbnails, 600);
        });
    }

    // Also try attaching on initial load (direct watch page visits)
    attachVideoEndedListener();
    // Retry after a short delay in case the video element isn't ready yet
    setTimeout(attachVideoEndedListener, 2000);
})();
