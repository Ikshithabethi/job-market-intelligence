/**
 * Consistent success envelope for every endpoint:
 *   { success: true, data: ..., meta?: ... }
 *
 * Errors use the same envelope with success:false (see middleware/errorHandler).
 */
function ok(res, data, meta) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(200).json(body);
}

function created(res, data, meta) {
  const body = { success: true, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(201).json(body);
}

module.exports = { ok, created };
