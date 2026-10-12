/** The backend's test stack, as the CLI's e2e suite uses it. */
export const BACKEND_API = new URL('../../../backend/apps/api/', import.meta.url);
export const API_PORT = 5170;
export const API = `http://localhost:${API_PORT}`;
/** The origin the API trusts for the browser's approve call (FRONTEND_HOST). */
export const WEB = 'http://localhost:5172';
/** A stand-in for releases.qotm.dev, serving <version>/qotm.sqlite (RELEASES_BASE_URL). */
export const RELEASES_PORT = 5171;
export const RELEASES = `http://localhost:${RELEASES_PORT}`;
/** The release the e2e seed publishes last: the manifest's current one. */
export const CURRENT = 'v2026.08.3';
