// This script runs in the context of the target page
import { logError } from "../functions/logger";

(function() {
    // console.log("getHtml.js content script executing.");
    try {
        const html = document.documentElement.outerHTML;
        // console.log("getHtml.js: Got HTML content.");
        // Return the HTML content as the result of the script execution
        return html;
    } catch (error) {
        logError("getHtmlContentScript", "Error getting HTML", { error });
        return null; // Return null or throw error? Returning null might be safer.
    }
})(); 