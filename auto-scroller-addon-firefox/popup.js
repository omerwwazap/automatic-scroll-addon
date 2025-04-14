/**
 * JavaScript for the Auto Page Scroller popup (popup.html).
 * Handles user interactions within the popup to control scrolling speed and state.
 * Uses an exponential mapping for the speed slider and imports shared constants.
 */

// Import shared constants from constants.js
import { Constants } from './constants.js';

// --- DOM Elements ---
const speedSlider = document.getElementById('speedSlider');
const speedValueDisplay = document.getElementById('speedValue');
const toggleButton = document.getElementById('toggleButton');

// --- Helper Functions ---

/**
 * Maps the slider value (1-100) to a scroll interval using an exponential scale.
 * Uses imported constants for min/max interval.
 * @param {number} sliderValue - The value from the slider (1-100).
 * @returns {number} The corresponding scroll interval in milliseconds.
 */
function sliderValueToInterval(sliderValue) {
    const sliderMin = parseInt(speedSlider.min, 10);
    const sliderMax = parseInt(speedSlider.max, 10);
    const sliderRange = sliderMax - sliderMin;

    const clampedSliderValue = Math.max(sliderMin, Math.min(sliderMax, sliderValue));
    const proportion = (clampedSliderValue - sliderMin) / sliderRange;

    // Use imported constants
    // Using the values from your constants.js: MIN=1, MAX=100
    if (Constants.MAX_INTERVAL_MS <= Constants.MIN_INTERVAL_MS) {
        return Constants.MIN_INTERVAL_MS;
    }
    const factor = Constants.MIN_INTERVAL_MS / Constants.MAX_INTERVAL_MS;
    let interval = Constants.MAX_INTERVAL_MS * Math.pow(factor, proportion);

    // Clamp using imported constants
    interval = Math.max(Constants.MIN_INTERVAL_MS, Math.min(Constants.MAX_INTERVAL_MS, interval));
    return Math.round(interval);
}

/**
 * Maps a scroll interval (ms) back to an approximate slider value (1-100).
 * Uses imported constants for min/max interval.
 * @param {number} intervalMs - The scroll interval in milliseconds.
 * @returns {number} The corresponding slider value.
 */
function intervalToSliderValue(intervalMs) {
    const sliderMin = parseInt(speedSlider.min, 10);
    const sliderMax = parseInt(speedSlider.max, 10);
    const sliderRange = sliderMax - sliderMin;

    // Clamp using imported constants (MIN=1, MAX=100)
    const clampedInterval = Math.max(Constants.MIN_INTERVAL_MS, Math.min(Constants.MAX_INTERVAL_MS, intervalMs));

    if (Constants.MAX_INTERVAL_MS <= Constants.MIN_INTERVAL_MS || clampedInterval <= 0) {
        return (clampedInterval <= Constants.MIN_INTERVAL_MS) ? sliderMax : sliderMin;
    }

    const logFactor = Math.log(Constants.MIN_INTERVAL_MS / Constants.MAX_INTERVAL_MS);
    const logIntervalRatio = Math.log(clampedInterval / Constants.MAX_INTERVAL_MS);

    if (logFactor === 0) return sliderMin;

    let proportion = logIntervalRatio / logFactor;
    proportion = Math.max(0, Math.min(1, proportion));
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
            if (callback) callback(response, null);
          })
          .catch(error => {
               console.error(`Popup: Error sending message or receiving response: ${error}`, message);
               if (callback) callback(null, error);
          });
      } else {
        console.warn("Popup: No active tab found.");
        if (callback) callback(null, new Error("No active tab found"));
      }
    })
    .catch(error => {
        console.error(`Popup: Error querying tabs: ${error}`);
        if (callback) callback(null, error);
    });
}

/**
 * Updates the UI elements (slider, button text) based on the current state.
 * @param {boolean} isScrolling - Whether scrolling is currently active.
 * @param {number} intervalMs - The current scroll interval.
 */
function updateUI(isScrolling, intervalMs) {
    // Sanitize interval just in case, using imported constants
    const safeInterval = Math.max(Constants.MIN_INTERVAL_MS, Math.min(Constants.MAX_INTERVAL_MS, intervalMs));
    console.log(`Popup: Updating UI - isScrolling: ${isScrolling}, interval: ${safeInterval}`);

    const sliderValue = intervalToSliderValue(safeInterval);
    speedSlider.value = sliderValue;
    speedValueDisplay.textContent = safeInterval; // Display the actual interval

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
    speedValueDisplay.textContent = newInterval;
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
             return;
        }
        if (response && typeof response.isScrolling === 'boolean') {
            console.log("Popup: Updating UI based on content script response.");
            const currentInterval = sliderValueToInterval(speedSlider.value);
            updateUI(response.isScrolling, currentInterval);
        } else {
            console.warn("Popup: Invalid response received from content script. UI might be inaccurate.");
        }
    });
});


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // Use imported default constant (DEFAULT_INTERVAL_MS = 80 from your constants.js)
    const defaultPopupInterval = Constants.DEFAULT_INTERVAL_MS;

    browser.storage.local.get("scrollInterval")
        .then(result => {
            // Use imported constants for validation/default (MIN=1, MAX=100)
            const savedInterval = (result.scrollInterval && typeof result.scrollInterval === 'number')
                ? Math.max(Constants.MIN_INTERVAL_MS, Math.min(Constants.MAX_INTERVAL_MS, result.scrollInterval))
                : defaultPopupInterval;
            console.log("Popup: Loaded interval from storage:", savedInterval);

            sendMessageToContentScript({ command: "get-status" }, (response, error) => {
                 console.log("Popup: Initial status response:", response, "Error:", error);
                if (!error && response && typeof response.isScrolling === 'boolean' && typeof response.currentInterval === 'number') {
                     console.log("Popup: Initializing UI from content script status.");
                     // Ensure interval from content script is also displayed correctly within popup's range understanding
                     updateUI(response.isScrolling, response.currentInterval);
                } else {
                     console.warn("Popup: Could not get initial status from content script. Initializing from storage/defaults.");
                     // Use the potentially sanitized savedInterval
                     updateUI(false, savedInterval);
                }
            });
        })
        .catch(error => {
            console.error(`Popup: Error loading speed from storage: ${error}`);
            // Fallback to default if storage fails
            updateUI(false, defaultPopupInterval);
        });
});

// Update version marker to reflect constants import
console.log("Popup script loaded (v1.3.0 - Constants Imported).");
