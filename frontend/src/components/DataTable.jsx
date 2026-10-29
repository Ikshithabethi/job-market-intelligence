/**
 * Searchable table.
 *
 * columns: [{ key, label, render?(row), align?: 'num', searchable?: boolean }]
 * The search box filters on the values returned by `searchText(row)` (defaults
 * to every searchable column), so pages can add their own hidden fields.
 */
import { useMemo, useState } from 'react';
import { EmptyBlock } from './StateBlocks';

export function DataTable({
  columns,
  rows,
  searchable = true,
  searchPlaceholder = 'Search rows...',
  emptyMessage = 'No records match the current selection.',
  searchText,
  toolbar,
  initialSearch = '',
  maxHeight,
}) {
  const [search, setSearch] = useState(initialSearch);
  const [sort, setSort] = useState(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let working = rows || [];

    if (term) {
      working = working.filter((row) => {
        const haystack = searchText
          ? searchText(row)
          : columns
              .filter((column) => column.searchable !== false)
              .map((column) => (row[column.key] === null || row[column.key] === undefined ? '' : row[column.key]))
              .join(' ');
        return String(haystack).toLowerCase().includes(term);
      });
    }

    if (sort) {
      const column = columns.find((entry) => entry.key === sort.key);
      if (column) {
        const factor = sort.direction === 'asc' ? 1 : -1;
        working = [...working].sort((a, b) => {
          const left = a[sort.key];
          const right = b[sort.key];
          if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
          return String(left ?? '').localeCompare(String(right ?? '')) * factor;
        });
      }
    }

    return working;
  }, [rows, search, sort, columns, searchText]);

  const toggleSort = (column) => {
    if (column.sortable === false) return;
    setSort((current) => {
      if (!current || current.key !== column.key) return { key: column.key, direction: 'asc' };
      return { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const showToolbar = searchable || toolbar;

  return (
    <div>
      {showToolbar && (
        <div className="table-toolbar">
          {searchable && (
            <input
              type="search"
              value={search}
              placeholder={searchPlaceholder}
              onChange={(event) => setSearch(event.target.value)}
              style={{ maxWidth: 280 }}
              aria-label={searchPlaceholder}
            />
          )}
          {search && (
            <span className="small muted">
              {filtered.length} of {(rows || []).length} rows
            </span>
          )}
          {toolbar}
        </div>
      )}

      <div className="table-scroll" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort && sort.key === column.key;
                return (
                  <th
                    key={column.key}
                    className={column.align === 'num' ? 'num' : undefined}
                    onClick={() => toggleSort(column)}
                    style={column.sortable === false ? undefined : { cursor: 'pointer' }}
                    title={column.sortable === false ? undefined : 'Click to sort'}
                  >
                    {column.label}
                    {active ? (sort.direction === 'asc' ? ' ^' : ' v') : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="table-empty">
                    <EmptyBlock message={emptyMessage} />
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((row, index) => (
                <tr key={row.id ?? `${index}-${row.label ?? ''}`}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.align === 'num' ? 'num' : undefined}>
                      {column.render ? column.render(row) : formatCell(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return <span className="muted">--</span>;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export default DataTable;
