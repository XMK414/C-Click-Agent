// scripts/build-e2e.mjs — thin wrapper: builds to dist-e2e/ for the Playwright
// lane. See build-common.mjs for the actual pipeline (shared with build.mjs,
// slice 1.9's production build — the two outputs must stay structurally
// identical).

import { buildApp } from './build-common.mjs';

await buildApp('dist-e2e');
