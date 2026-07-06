// scripts/build.mjs — thin wrapper: builds to dist/ for real packaging
// (electron-builder, slice 1.9). See build-common.mjs for the actual pipeline
// (shared with build-e2e.mjs's dist-e2e/ output — the two must stay
// structurally identical).

import { buildApp } from './build-common.mjs';

await buildApp('dist');
