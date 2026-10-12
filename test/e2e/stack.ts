/** The backend's test stack, as the CLI's e2e suite uses it. */
export const BACKEND_API = new URL('../../../backend/apps/api/', import.meta.url);
export const API_PORT = 5170;
export const API = `http://localhost:${API_PORT}`;
/** The origin the API trusts for the browser's approve call (FRONTEND_HOST). */
export const WEB = 'http://localhost:5172';
