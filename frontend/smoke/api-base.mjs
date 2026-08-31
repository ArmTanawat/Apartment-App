/* Where the suites find the server.
 *
 * Not a constant, because the test runner starts a server of its own on a
 * throwaway database and a free port. That matters more than it used to: once
 * a receipt has been issued its bill cannot be deleted, so seed.mjs can no
 * longer clear a database that has been receipted — which is correct, and
 * means the tests must never share one with anybody.
 */
export const API = `http://127.0.0.1:${process.env.APARTMENT_TEST_PORT || 3001}`;
