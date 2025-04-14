import { Constants } from './constants.js';

/**
 * Background script for the Auto Page Scroller Firefox Add-on.
 * Handles keyboard commands to control scrolling speed.
 * The browser action click is now handled by opening popup.html.
 */

/**
 * Sends a message to the content script of the currently active tab.
 * @param {object} message - The message object to send.
 */
function sendMessageToActiveTab(message) {
  browser.tabs.query({ active: true, currentWindow: true })
    .then((tabs) => {
      if (tabs.length > 0) {
        const activeTabId = tabs[0].id;
        console.debug(`Background: Sending message to tab ${activeTabId}:`, message);
        browser.tabs.sendMessage(activeTabId, message)
          .catch(error => {
            console.warn(`Background: Could not send message to tab ${activeTabId}: ${error}. Content script might not be loaded.`);
          });
      } else {
        console.warn("Background: No active tab found to send message to.");
      }
    })
    .catch(error => console.error(`Background: Error querying active tab: ${error}`));
}

// --- Event Listeners ---

/**
 * Handles keyboard commands defined in manifest.json.
 * Sends commands to increase or decrease scroll speed in the active tab.
 */
browser.commands.onCommand.addListener((command) => {
  console.log(`Background: Command received: ${command}`);

  // Note: This sends a relative change amount. The popup sends an absolute interval.
  // The content script needs to handle both message types ('change-speed' and 'set-speed').
  switch (command) {
    case "increase-scroll-speed":
      sendMessageToActiveTab({
        command: "change-speed", // Relative change
        amount: -Constants.SPEED_CHANGE_AMOUNT,
        minInterval: Constants.MIN_INTERVAL_MS, // Use updated constants for clamping
        maxInterval: Constants.MAX_INTERVAL_MS
      });
      break;
    case "decrease-scroll-speed":
      sendMessageToActiveTab({
        command: "change-speed", // Relative change
        amount: Constants.SPEED_CHANGE_AMOUNT,
        minInterval: Constants.MIN_INTERVAL_MS, // Use updated constants for clamping
        maxInterval: Constants.MAX_INTERVAL_MS
      });
      break;
    default:
      console.warn(`Background: Unrecognized command: ${command}`);
  }
});

// --- Initialization ---
console.log("Auto Page Scroller background script loaded (v1.2.3)."); // Version marker updated

