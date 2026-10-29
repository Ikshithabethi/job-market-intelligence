/**
 * Saved career roadmaps.
 *
 * A roadmap snapshot is stored as JSON so the saved plan keeps its original
 * wording even if the underlying dataset is regenerated. Role ids are stored
 * with ON DELETE SET NULL, while the titles are copied as text snapshots so the
 * saved list stays readable.
 */
const { query, queryOne } = require('../config/db');
const ApiError = require('../utils/ApiError');

function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function shapeRoadmap(row, { detailed = false } = {}) {
  const summary = {
    id: row.id,
    fromRoleTitle: row.from_role_title,
    toRoleTitle: row.to_role_title,
    fromRoleId: row.from_role_id,
    toRoleId: row.to_role_id,
    hops: row.hops,
    totalYears: row.total_years === null ? null : Number(row.total_years),
    createdAt: row.created_at,
  };
  if (!detailed) return summary;

  return {
    ...summary,
    path: parseJsonColumn(row.path_json, []),
    missingSkills: parseJsonColumn(row.missing_skills_json, []),
    roadmap: parseJsonColumn(row.roadmap_json, []),
  };
}

async function listRoadmaps(userId) {
  const rows = await query(
    `SELECT id, from_role_id, to_role_id, from_role_title, to_role_title,
            hops, total_years, created_at
       FROM saved_roadmaps
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows.map((row) => shapeRoadmap(row));
}

async function getRoadmap(userId, roadmapId) {
  const row = await queryOne(
    `SELECT * FROM saved_roadmaps WHERE id = ? AND user_id = ?`,
    [roadmapId, userId]
  );
  if (!row) throw ApiError.notFound('Saved roadmap not found');
  return shapeRoadmap(row, { detailed: true });
}

/** Save a roadmap computed by the career endpoint (or a hand-built one). */
async function saveRoadmap(userId, payload) {
  const createdAt = new Date();
  const result = await query(
    `INSERT INTO saved_roadmaps
       (user_id, from_role_id, to_role_id, from_role_title, to_role_title,
        hops, total_years, path_json, missing_skills_json, roadmap_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      payload.fromRoleId || null,
      payload.toRoleId || null,
      payload.fromRoleTitle,
      payload.toRoleTitle,
      payload.hops || 0,
      payload.totalYears === undefined || payload.totalYears === null ? null : payload.totalYears,
      JSON.stringify(payload.path || []),
      JSON.stringify(payload.missingSkills || []),
      JSON.stringify(payload.roadmap || []),
      createdAt,
    ]
  );
  return getRoadmap(userId, result.insertId);
}

async function deleteRoadmap(userId, roadmapId) {
  const result = await query('DELETE FROM saved_roadmaps WHERE id = ? AND user_id = ?', [
    roadmapId,
    userId,
  ]);
  if (result.affectedRows === 0) throw ApiError.notFound('Saved roadmap not found');
  return { id: roadmapId, deleted: true };
}

async function countRoadmaps(userId) {
  const row = await queryOne('SELECT COUNT(*) AS total FROM saved_roadmaps WHERE user_id = ?', [
    userId,
  ]);
  return Number(row ? row.total : 0);
}

module.exports = { listRoadmaps, getRoadmap, saveRoadmap, deleteRoadmap, countRoadmaps };
