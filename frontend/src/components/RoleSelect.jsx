/**
 * Role dropdown grouped by role family.
 * Props: roles [{ id, title, family, seniority }], value, onChange, placeholder.
 */
import { useMemo } from 'react';

export function RoleSelect({ roles, value, onChange, placeholder = 'Select a role...', id }) {
  const grouped = useMemo(() => {
    const map = new Map();
    (roles || []).forEach((role) => {
      if (!map.has(role.family)) map.set(role.family, []);
      map.get(role.family).push(role);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [roles]);

  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
    >
      <option value="">{placeholder}</option>
      {grouped.map(([family, entries]) => (
        <optgroup key={family} label={family}>
          {entries.map((role) => (
            <option key={role.id} value={role.id}>
              {role.title} ({role.seniority})
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default RoleSelect;
