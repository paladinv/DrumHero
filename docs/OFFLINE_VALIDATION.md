# Offline download validation

The offline download is opt-in. It stores the production page shells, static assets, built-in sounds, and kit models in a versioned service-worker cache. Learner progress and songs use their existing local storage. Account sync still needs a connection. Use this checklist on a deployed build and record the browser and device before signing off.

## Manual release checklist

| Check | Procedure | Evidence to record |
| --- | --- | --- |
| Fresh download | While online, download the app from Progress or Song Library. Confirm the saved build version, page count, size estimate, and completion message. | Device, OS, browser, build, saved size |
| Offline navigation | Disconnect the network, open each downloaded route from Home, then navigate between routes and refresh. Include Trainer, Practice Pad, the guided-session page, Kit Guide, Play-alongs, and Song Library. | Routes opened, refresh result, console or service-worker errors |
| Offline learning | Complete a lesson step, Trainer round, and local song edit while offline. Play previously imported backing audio from Play-Alongs or Song Builder, including more than one Play-Along stem, reload, and confirm local work and audio remain available. | Which local records and audio survived refresh |
| Integrity check | Run **Verify offline readiness** offline. Confirm missing or corrupt resources are reported and the UI offers recovery after reconnecting. | Checked, missing, corrupt, bytes |
| Successful upgrade | Reconnect, update to a build with a changed asset manifest, then disconnect and reopen the downloaded routes. | Old/new build versions, update result |
| Same-build retry | Start an update with the currently saved build version. Confirm it stages as a separate cache and only switches after all pages and assets complete. | Saved cache name before/after, integrity result |
| Interrupted upgrade | Interrupt the network or close the browser during an update. Reopen offline and confirm the last completed download still works; reconnect and retry. | Interruption method and retained cache version |
| Storage pressure | Use a browser profile with limited available quota. Attempt an update, verify the last completed copy remains available, remove the download, and confirm learner data is unchanged. | Quota estimate, update/removal outcome |
| Installed PWA | Repeat install, offline launch, refresh, and update on iOS Safari home-screen install and Android Chrome install where supported. | Install mode and platform-specific behavior |

Updates stage into a new cache and switch the saved-download pointer only after the full asset and page set has downloaded. On failure, the incomplete staging cache is removed and the prior completed download stays active. The quota estimate is advisory because browsers may report approximate availability or evict storage. Do not mark a row complete from feature detection alone. Attach manual observations to the release record and report browser-specific failures separately. Browser storage can still be evicted by the operating system, so keep a separate backup for important learner work.

The offline manifest build checks that the generated route list matches the service worker's route allowlist, so a page cannot be reported as downloadable while the worker lacks a route fallback. Offline guided-session creation uses a document navigation when disconnected, allowing the service worker to return the saved page shell. These safeguards do not replace the physical-browser navigation and storage checks above.

## Sign-off record

| Date | Device / OS | Browser / version | Build | Checks completed | Result / issue reference | Reviewer |
| --- | --- | --- | --- | --- | --- | --- |
| Not yet run | — | — | — | — | This repository contains the procedure, not a physical-device sign-off | — |
