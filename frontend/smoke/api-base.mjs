/* Where the suites find the server.
 *
 * Not a constant, because the test runner starts a server of its own on a
 * throwaway database and a free port. The suites re-seed whatever they find,
 * so borrowing the database somebody is working on would wipe it.
 */
export const API = `http://127.0.0.1:${process.env.APARTMENT_TEST_PORT || 3001}`;
