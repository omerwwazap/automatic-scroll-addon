/**
 * JavaScript for the Auto Page Scroller popup (popup.html).
 * Handles user interactions within the popup to control scrolling speed and state.
 * Uses an exponential mapping for the speed slider for increased sensitivity.
 */

// --- Constants ---
const MIN_INTERVAL_MS = 10;     // Fastest scroll interval (remains 10ms)
const MAX_INTERVAL_MS = 300;    // Slowest scroll interval *** CHANGED FROM 500 ***
const DEFAULT_INTERVAL_MS = 80; // Default interval if nothing is stored

// --- DOM Elements ---
const speedSlider = document.getElementById('speedSlider');
const speedValueDisplay = document.getElementById('speedValue');
const toggleButton = document.getElementById('toggleButton');

// --- Helper Functions ---

/**
 * Maps the slider value (1-100) to a scroll interval using an exponential scale.
 * This makes the slider more sensitive at the faster end (higher slider values).
 * @param {number} sliderValue - The value from the slider (1-100).
 * @returns {number} The corresponding scroll interval in milliseconds.
 */
function sliderValueToInterval(sliderValue) {
    const sliderMin = parseInt(speedSlider.min, 10);
    const sliderMax = parseInt(speedSlider.max, 10);
    const sliderRange = sliderMax - sliderMin; // e.g., 99

    // Ensure sliderValue is within bounds
    const clampedSliderValue = Math.max(sliderMin, Math.min(sliderMax, sliderValue));

    // Calculate proportion: 0 (slowest) to 1 (fastest)
    const proportion = (clampedSliderValue - sliderMin) / sliderRange;

    // Exponential mapping: interval = MAX * (MIN/MAX)^proportion
    // This makes the interval decrease faster as proportion approaches 1.
    if (MAX_INTERVAL_MS <= MIN_INTERVAL_MS) { // Avoid division by zero or log(<=0)
        return MIN_INTERVAL_MS;
    }
    const factor = MIN_INTERVAL_MS / MAX_INTERVAL_MS;
    let interval = MAX_INTERVAL_MS * Math.pow(factor, proportion);

    // Ensure the result is within the defined min/max interval bounds
    interval = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, interval));

    return Math.round(interval);
}

/**
 * Maps a scroll interval (ms) back to an approximate slider value (1-100)
 * using the inverse of the exponential mapping.
 * @param {number} intervalMs - The scroll interval in milliseconds.
 * @returns {number} The corresponding slider value.
 */
function intervalToSliderValue(intervalMs) {
    const sliderMin = parseInt(speedSlider.min, 10);
    const sliderMax = parseInt(speedSlider.max, 10);
    const sliderRange = sliderMax - sliderMin;

    // Clamp interval to ensure it's within the expected range for calculation
    const clampedInterval = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, intervalMs));

    if (MAX_INTERVAL_MS <= MIN_INTERVAL_MS || clampedInterval <= 0) {
        // Handle edge cases: If min/max are invalid or interval is non-positive,
        // return slider min or max depending on which bound interval hits.
        return (clampedInterval <= MIN_INTERVAL_MS) ? sliderMax : sliderMin;
    }

    // Inverse mapping: proportion = log(interval / MAX) / log(MIN / MAX)
    const logFactor = Math.log(MIN_INTERVAL_MS / MAX_INTERVAL_MS);
    const logIntervalRatio = Math.log(clampedInterval / MAX_INTERVAL_MS);

    // Avoid division by zero if MIN == MAX
    if (logFactor === 0) {
        return sliderMin; // Or sliderMax, depending on desired behavior when MIN=MAX
    }

    let proportion = logIntervalRatio / logFactor;

    // Clamp proportion between 0 and 1 in case of floating point inaccuracies
    proportion = Math.max(0, Math.min(1, proportion));

    // Map proportion back to slider value
    const sliderValue = (proportion * sliderRange) + sliderMin;

    return Math.round(sliderValue);
}


/**
 * Sends a message to the active tab's content script.
 * @param {object} message - The message to send.
 * @param {function} [callback] - Optional callback function for the response (receives response, error).
 */
function sendMessageToContentScript(message, callback) {
  browser.tabs.query({ active: true, currentWindow: true })
    .then((tabs) => {
      if (tabs.length > 0) {
        browser.tabs.sendMessage(tabs[0].id, message)
          .then(response => {
            console.log("Popup: Received response:", response);
            if (callback) {
              callback(response, null); // Pass null for error
            }
          })
          .catch(error => {
               console.error(`Popup: Error sending message or receiving response: ${error}`, message);
               if (callback) {
                   callback(null, error); // Pass null response and the error
               }
          });
      } else {
        console.warn("Popup: No active tab found.");
        if (callback) {
            callback(null, new Error("No active tab found"));
        }
      }
    })
    .catch(error => {
        console.error(`Popup: Error querying tabs: ${error}`);
        if (callback) {
            callback(null, error);
        }
    });
}

/**
 * Updates the UI elements (slider, button text) based on the current state.
 * @param {boolean} isScrolling - Whether scrolling is currently active.
 * @param {number} intervalMs - The current scroll interval.
 */
function updateUI(isScrolling, intervalMs) {
    console.log(`Popup: Updating UI - isScrolling: ${isScrolling}, interval: ${intervalMs}`);
    const sliderValue = intervalToSliderValue(intervalMs);
    speedSlider.value = sliderValue;
    speedValueDisplay.textContent = intervalMs;

    if (isScrolling) {
        toggleButton.textContent = "Stop Scrolling";
        toggleButton.classList.add('stop-button');
    } else {
        toggleButton.textContent = "Start Scrolling";
        toggleButton.classList.remove('stop-button');
    }
}


// --- Event Listeners ---

speedSlider.addEventListener('input', () => {
    const newInterval = sliderValueToInterval(speedSlider.value);
    speedValueDisplay.textContent = newInterval; // Update display immediately

    // Debounce saving/sending message slightly? Optional. For now, send immediately.
    browser.storage.local.set({ scrollInterval: newInterval })
        .catch(error => console.error(`Error saving speed: ${error}`));
    sendMessageToContentScript({
        command: "set-speed",
        interval: newInterval
    });
});

toggleButton.addEventListener('click', () => {
    console.log("Popup: Toggle button clicked.");
    const wasScrolling = toggleButton.textContent.includes("Stop");

    sendMessageToContentScript({ command: "toggle-scroll" }, (response, error) => {
        if (error) {
             console.warn("Popup: Toggle failed or content script did not respond. UI might be inaccurate.", error);
             // Attempt to revert UI based on the state *before* the click (less reliable)
             // updateUI(wasScrolling, sliderValueToInterval(speedSlider.value));
             return;
        }
        if (response && typeof response.isScrolling === 'boolean') {
            console.log("Popup: Updating UI based on content script response.");
            // Need the *current* interval to update UI correctly.
            // It might have changed via shortcut since popup opened. Query it again?
            // Or just use the interval corresponding to the current slider value? Let's use slider value.
            const currentInterval = sliderValueToInterval(speedSlider.value);
            updateUI(response.isScrolling, currentInterval);
        } else {
            console.warn("Popup: Invalid response received from content script. UI might be inaccurate.");
            // const currentInterval = sliderValueToInterval(speedSlider.value);
            // updateUI(!wasScrolling, currentInterval); // Optimistic toggle based on previous state
        }
    });
});


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    browser.storage.local.get("scrollInterval")
        .then(result => {
            const savedInterval = result.scrollInterval || DEFAULT_INTERVAL_MS;
            console.log("Popup: Loaded interval from storage:", savedInterval);

            sendMessageToContentScript({ command: "get-status" }, (response, error) => {
                 console.log("Popup: Initial status response:", response, "Error:", error);
                if (!error && response && typeof response.isScrolling === 'boolean' && typeof response.currentInterval === 'number') {
                     console.log("Popup: Initializing UI from content script status.");
                     updateUI(response.isScrolling, response.currentInterval);
                } else {
                     console.warn("Popup: Could not get initial status from content script. Initializing from storage/defaults.");
                     updateUI(false, savedInterval);
                }
            });
        })
        .catch(error => {
            console.error(`Popup: Error loading speed from storage: ${error}`);
            updateUI(false, DEFAULT_INTERVAL_MS);
        });
});

console.log("Popup script loaded (v1.2.3 - Range Update)."); // Version marker updated
