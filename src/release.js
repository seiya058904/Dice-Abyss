// Browser-visible product version. The save schema and storage keys are separate.
// tests/release-identity.test.mjs checks this against package.json and index.html.
export const RELEASE_VERSION = '5.27.0';
export const RELEASE_STAMP = RELEASE_VERSION.split('.').map((part, index) => index === 0 ? part.padStart(2, '0') : part).join('.');
