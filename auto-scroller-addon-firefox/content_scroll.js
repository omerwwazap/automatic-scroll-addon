/**
 * Content script for the Auto Page Scroller Firefox Add-on.
 * Handles scrolling logic, responds to messages from background/popup.
 */

(() => {
    // --- Constants ---
    const DEFAULT_INTERVAL_MS = 80;
    const MIN_INTERVAL_MS = 10;     // Fastest scroll interval (remains 10ms)
    const MAX_INTERVAL_MS = 300;    // Slowest scroll interval *** CHANGED FROM 500 ***
    const SCROLL_STEP_PIXELS = 2;
  
    // --- State Variables ---
    let isScrollingActive = false;
    let scrollIntervalTimerId = null;
    let currentScrollIntervalMs = DEFAULT_INTERVAL_MS; // Initialize with default
  
    // --- Core Scrolling Logic ---
  
    function performScrollStep() {
      const scrollableHeight = document.body.scrollHeight - window.innerHeight;
      if (window.scrollY >= scrollableHeight - SCROLL_STEP_PIXELS) {
        console.log("Content: Reached bottom, stopping scroll.");
        stopScrolling();
      } else {
        window.scrollBy(0, SCROLL_STEP_PIXELS);
      }
    }
  
    function startScrolling() {
      if (isScrollingActive) return;
      console.log(`Content: Starting scroll with interval: ${currentScrollIntervalMs}ms`);
      isScrollingActive = true;
      if (scrollIntervalTimerId !== null) clearInterval(scrollIntervalTimerId);
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
       // Clamp the value using the updated constants
       currentScrollIntervalMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, newInterval));
       console.log(`Content: Speed set to interval: ${currentScrollIntervalMs}ms`);
       if (isScrollingActive) {
         stopScrolling();
         startScrolling();
       }
       browser.storage.local.set({ scrollInterval: currentScrollIntervalMs })
          .catch(error => console.error(`Content: Error saving speed: ${error}`));
    }
  
    /**
     * Adjusts the scrolling speed relative to the current speed (used by shortcuts). Clamps value within bounds.
     * @param {number} amount - The amount (ms) to add (negative for faster).
     * @param {number} minInterval - Minimum allowed interval (passed from background).
     * @param {number} maxInterval - Maximum allowed interval (passed from background).
     */
    function changeSpeedRelative(amount, minInterval, maxInterval) {
      const proposedInterval = currentScrollIntervalMs + amount;
      // Clamp using the min/max passed from the message (which should match constants)
      const clampedInterval = Math.max(minInterval, Math.min(maxInterval, proposedInterval));
      // Use the absolute setter which also saves the value
      setSpeed(clampedInterval);
    }
  
  
    // --- Message Handling ---
  
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.debug("Content: Message received:", message);
  
      switch (message.command) {
        case "toggle-scroll":
          const newState = toggleScrolling();
          sendResponse({ isScrolling: newState });
          return true;
  
        case "set-speed":
          if (typeof message.interval === 'number') {
            setSpeed(message.interval); // setSpeed handles clamping
          } else {
             console.error("Content: Invalid 'set-speed' message:", message);
          }
          break;
  
        case "change-speed":
          if (typeof message.amount === 'number' &&
              typeof message.minInterval === 'number' &&
              typeof message.maxInterval === 'number') {
            // Pass the min/max from the message for clamping in relative change
            changeSpeedRelative(message.amount, message.minInterval, message.maxInterval);
          } else {
             console.error("Content: Invalid 'change-speed' message:", message);
          }
          break;
  
        case "get-status":
           sendResponse({
               isScrolling: isScrollingActive,
               currentInterval: currentScrollIntervalMs
           });
           return true;
  
        default:
          console.warn("Content: Unknown command received:", message.command);
      }
      return false;
    });
  
    // --- Initialization ---
  
    browser.storage.local.get("scrollInterval")
      .then(result => {
        if (result.scrollInterval && typeof result.scrollInterval === 'number') {
          // Clamp loaded value using updated constants
          currentScrollIntervalMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, result.scrollInterval));
          console.log(`Content: Initialized with saved interval: ${currentScrollIntervalMs}ms`);
        } else {
          console.log(`Content: No saved interval found, using default: ${DEFAULT_INTERVAL_MS}ms`);
          currentScrollIntervalMs = DEFAULT_INTERVAL_MS;
        }
      })
      .catch(error => {
        console.error(`Content: Error loading scroll interval from storage: ${error}`);
        currentScrollIntervalMs = DEFAULT_INTERVAL_MS;
      });
  
    console.log("Auto Page Scroller content script injected and ready (v1.2.3)."); // Version marker updated
  
  })(); // End of IIFE
  