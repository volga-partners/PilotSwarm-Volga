/**
 * Express error handler middleware (4-arg signature).
 * Converts errors to JSON responses.
 */

export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || String(err);
  console.error("[error]", message);
  res.status(status).json({ ok: false, error: message });
}
