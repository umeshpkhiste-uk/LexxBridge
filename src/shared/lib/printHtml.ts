import { alertMessage } from "./alert";

/**
 * expo-print's web implementation ignores whatever HTML is passed to
 * printToFileAsync/printAsync entirely — its whole implementation is
 * `async printToFileAsync() { window.print(); }` — so it was printing
 * *this app's own page*, not the document passed in. There is no web build
 * of expo-print that actually renders arbitrary HTML, so on web this opens
 * the document in its own tab and prints that tab instead: the one
 * reliable, dependency-free way to turn arbitrary HTML into a "Save as PDF"
 * prompt in a browser.
 */
export function printHtmlOnWeb(html: string) {
  // An empty URL isn't a reliable way to get a blank window — per the
  // open() spec it resolves relative to the current page, so it can
  // instead navigate the new window to *this app's own URL* a moment
  // later, wiping out the document just written below. "about:blank" is
  // the one URL that's guaranteed to stay put.
  const win = window.open("about:blank", "_blank");
  if (!win) {
    alertMessage("Pop-up blocked", "Allow pop-ups for this site, then try again.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Let the new document finish laying out before printing — some
  // browsers ignore print() called synchronously right after write().
  setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
}
