const Constants = {
    MIN_INTERVAL_MS: 10,
    MAX_INTERVAL_MS: 100,
    DEFAULT_INTERVAL_MS: 80,
    SCROLL_STEP_PIXELS: 4,
    SPEED_CHANGE_AMOUNT: 15
};

/**
 * Content script for the Auto Page Scroller Firefox Add-on.
 * Handles scrolling logic, responds to messages from background/popup.
 */

(() => {
    console.log("Content script starting to load...");

    // --- Constants ---
    const DEFAULT_INTERVAL_MS = Constants.DEFAULT_INTERVAL_MS;
    const SCROLL_STEP_PIXELS = Constants.SCROLL_STEP_PIXELS;

    // --- Validation Utilities ---
    const validators = {
        isValidNumber: (value) => {
            return typeof value === 'number' && 
                   Number.isFinite(value) && 
                   !Number.isNaN(value);
        },
        
        isValidInterval: (value) => {
            return validators.isValidNumber(value) && 
                   value >= Constants.MIN_INTERVAL_MS && 
                   value <= Constants.MAX_INTERVAL_MS;
        },

        sanitizeInterval: (value, defaultValue = DEFAULT_INTERVAL_MS) => {
            if (!validators.isValidNumber(value)) {
                console.warn(`Invalid interval value: ${value}, using default`);
                return defaultValue;
            }
            return Math.max(Constants.MIN_INTERVAL_MS, Math.min(Constants.MAX_INTERVAL_MS, value));
        },

        validateMessage: (message) => {
            if (!message || typeof message !== 'object') {
                throw new Error('Invalid message format');
            }
            if (typeof message.command !== 'string') {
                throw new Error('Invalid command format');
            }
            return true;
        }
    };

    // --- State Variables ---
    let isScrollingActive = false;
    let scrollIntervalTimerId = null;
    let currentScrollIntervalMs = DEFAULT_INTERVAL_MS;
    let lastScrollPosition = 0;

    // --- Core Scrolling Logic ---
    function performScrollStep() {
        requestAnimationFrame(() => {
            try {
                const scrollableHeight = Math.max(0, 
                    document.documentElement.scrollHeight - window.innerHeight);
                
                if (window.scrollY >= scrollableHeight - SCROLL_STEP_PIXELS) {
                    console.log("Content: Reached bottom, stopping scroll.");
                    stopScrolling();
                    return;
                }
                
                window.scrollBy({
                    top: SCROLL_STEP_PIXELS,
                    behavior: 'auto'
                });
            } catch (error) {
                console.error("Scroll step error:", error);
                stopScrolling();
            }
        });
    }

    function startScrolling() {
        if (isScrollingActive) return;
        
        if (!validators.isValidInterval(currentScrollIntervalMs)) {
            console.error("Invalid scroll interval detected, resetting to default");
            currentScrollIntervalMs = DEFAULT_INTERVAL_MS;
        }

        console.log(`Content: Starting scroll with interval: ${currentScrollIntervalMs}ms`);
        isScrollingActive = true;
        
        if (scrollIntervalTimerId !== null) {
            clearInterval(scrollIntervalTimerId);
        }
        
        scrollIntervalTimerId = setInterval(performScrollStep, currentScrollIntervalMs);
    }

    function stopScrolling() {
        if (!isScrollingActive) return;
        console.log("Content: Stopping scroll.");
        isScrollingActive = false;
        if (scrollIntervalTimerId !== null) {
            clearInterval(scrollIntervalTimerId);
            scrollIntervalTimerId = null;
        }
    }

    function toggleScrolling() {
        if (isScrollingActive) {
            stopScrolling();
        } else {
            startScrolling();
        }
        return isScrollingActive;
    }

    /**
     * Sets the scroll speed to an absolute interval value. Clamps value within bounds.
     * @param {number} newInterval - The new scroll interval in milliseconds.
     */
    function setSpeed(newInterval) {
        if (!validators.isValidNumber(newInterval)) {
            console.error("Invalid speed value provided");
            return;
        }

        currentScrollIntervalMs = validators.sanitizeInterval(newInterval);
        console.log(`Content: Speed set to interval: ${currentScrollIntervalMs}ms`);

        if (isScrollingActive) {
            stopScrolling();
            startScrolling();
        }

        browser.storage.local.set({ 
            scrollInterval: currentScrollIntervalMs 
        }).catch(error => console.error(`Content: Error saving speed: ${error}`));
    }

    /**
     * Adjusts the scrolling speed relative to the current speed (used by shortcuts). Clamps value within bounds.
     * @param {number} amount - The amount (ms) to add (negative for faster).
     * @param {number} minInterval - Minimum allowed interval (passed from background).
     * @param {number} maxInterval - Maximum allowed interval (passed from background).
     */
    function changeSpeedRelative(amount, minInterval, maxInterval) {
        if (!validators.isValidNumber(amount)) {
            console.error("Invalid speed change amount");
            return;
        }

        const safeMinInterval = validators.sanitizeInterval(minInterval, Constants.MIN_INTERVAL_MS);
        const safeMaxInterval = validators.sanitizeInterval(maxInterval, Constants.MAX_INTERVAL_MS);
        
        const proposedInterval = currentScrollIntervalMs + amount;
        setSpeed(proposedInterval); // setSpeed will handle sanitization
    }

    // --- Message Handling ---
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
            validators.validateMessage(message);
            console.debug("Content: Message received:", message);

            switch (message.command) {
                case "toggle-scroll":
                    const newState = toggleScrolling();
                    sendResponse({ isScrolling: newState });
                    return true;

                case "set-speed":
                    if (!validators.isValidNumber(message.interval)) {
                        throw new Error("Invalid speed value received");
                    }
                    setSpeed(message.interval);
                    break;

                case "change-speed":
                    if (!validators.isValidNumber(message.amount) || 
                        !validators.isValidNumber(message.minInterval) || 
                        !validators.isValidNumber(message.maxInterval)) {
                        throw new Error("Invalid speed change parameters");
                    }
                    changeSpeedRelative(
                        message.amount,
                        message.minInterval,
                        message.maxInterval
                    );
                    break;

                case "get-status":
                    sendResponse({
                        isScrolling: isScrollingActive,
                        currentInterval: currentScrollIntervalMs
                    });
                    return true;

                default:
                    throw new Error(`Unknown command: ${message.command}`);
            }
        } catch (error) {
            console.error("Message handling error:", error);
            sendResponse({ error: error.message });
            return false;
        }
    });

    // --- Initialization ---
    browser.storage.local.get("scrollInterval")
        .then(result => {
            if (result.scrollInterval && validators.isValidNumber(result.scrollInterval)) {
                currentScrollIntervalMs = validators.sanitizeInterval(result.scrollInterval);
                console.log(`Content: Initialized with saved interval: ${currentScrollIntervalMs}ms`);
            } else {
                console.log(`Content: Using default interval: ${DEFAULT_INTERVAL_MS}ms`);
                currentScrollIntervalMs = DEFAULT_INTERVAL_MS;
            }
        })
        .catch(error => {
            console.error(`Content: Error loading scroll interval: ${error}`);
            currentScrollIntervalMs = DEFAULT_INTERVAL_MS;
        });

    // Save scroll position before unload
    window.addEventListener('beforeunload', () => {
        try {
            lastScrollPosition = Math.max(0, window.scrollY);
            browser.storage.local.set({ lastScrollPosition });
        } catch (error) {
            console.error("Error saving scroll position:", error);
        }
    });

    console.log("Auto Page Scroller content script injected and ready (v1.2.3)."); // Version marker updated

})(); // End of IIFE
