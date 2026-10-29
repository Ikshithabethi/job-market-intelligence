/**
 * Minimal, dependency free CSV reader.
 *
 * The data/*.csv files are produced by python-analysis/generate_seed.py and
 * contain quoted fields with commas inside them (job descriptions), so a naive
 * split(',') is not enough. This parser handles:
 *   - quoted fields, including "" escaped quotes
 *   - commas and newlines inside quoted fields
 *   - CRLF line endings and a UTF-8 BOM
 *
 * @param {string} text raw file contents
 * @returns {Array<Object>} rows keyed by the header row
 */
function parseCsv(text) {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i += 1;
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  const nonEmpty = rows.filter((row) => !(row.length === 1 && row[0].trim() === ''));
  if (nonEmpty.length === 0) return [];

  const header = nonEmpty[0].map((name) => name.trim());
  return nonEmpty.slice(1).map((row) => {
    const entry = {};
    header.forEach((key, index) => {
      entry[key] = row[index] !== undefined ? row[index] : null;
    });
    return entry;
  });
}

module.exports = { parseCsv };
