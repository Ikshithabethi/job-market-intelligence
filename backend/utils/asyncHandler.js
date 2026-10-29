/**
 * Wraps an async route handler so rejected promises reach the error middleware
 * instead of becoming unhandled rejections.
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
