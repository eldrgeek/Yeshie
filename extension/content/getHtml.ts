// This script runs in the context of the target page

(function() {
    // console.log("getHtml.js content script executing.");
    try {
        const html = document.documentElement.outerHTML;
        // console.log("getHtml.js: Got HTML content.");
        // Return the HTML content as the result of the script execution
        return html;
    } catch (error) {
        console.error("getHtml.js: Error getting HTML:", error);
        return null; // Return null or throw error? Returning null might be safer.
    }
})(); 