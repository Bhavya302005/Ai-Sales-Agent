/* SignalPath PWA lifecycle worker.
 * Authenticated API responses, leads, transcripts, and pages are intentionally not cached.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
