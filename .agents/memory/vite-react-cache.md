---
name: Vite optimized React cache
description: Recover from stale dependency prebundling after a React version change in a web artifact.
---

When the shared React catalog changes, a package reinstall can update `node_modules` while Vite's per-artifact optimized dependency cache still points at the old React packages. If the browser continues to report a React/ReactDOM version mismatch after the package versions are aligned, inspect the artifact's Vite optimizer metadata before changing dependency versions again.

**Why:** The workspace package links and each Vite artifact's prebundled dependencies can update at different times, so a correct lockfile does not guarantee the running preview is using the current React version.

**How to apply:** Check the affected artifact's `.vite/deps/_metadata.json`; if it still points to the old package path, clear only that artifact's `.vite` cache and restart its web workflow.
