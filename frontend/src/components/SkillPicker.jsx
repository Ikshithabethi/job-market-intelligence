/**
 * Skill picker.
 *
 * A plain <select> grouped by category plus an "Add" button, with the current
 * selection shown as removable pills. It is deliberately simple: no custom
 * dropdown widget, so it behaves the same on every browser.
 *
 * Props:
 *   skills      - [{ id, name, category }] the full vocabulary
 *   value       - string[] of selected skill names
 *   onChange    - (nextNames: string[]) => void
 *   emptyMessage- text shown when there is nothing selected
 */
import { useMemo, useState } from 'react';

export function SkillPicker({ skills, value, onChange, emptyMessage = 'No skills selected yet.' }) {
  const [pending, setPending] = useState('');
  const [search, setSearch] = useState('');

  const selected = value || [];
  const selectedLower = useMemo(
    () => new Set(selected.map((name) => name.toLowerCase())),
    [selected]
  );

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (skills || [])
      .filter((skill) => !selectedLower.has(skill.name.toLowerCase()))
      .filter((skill) =>
        term ? `${skill.name} ${skill.category}`.toLowerCase().includes(term) : true
      );
  }, [skills, selectedLower, search]);

  // Group the remaining skills under their category for the <optgroup> list.
  const grouped = useMemo(() => {
    const map = new Map();
    available.forEach((skill) => {
      if (!map.has(skill.category)) map.set(skill.category, []);
      map.get(skill.category).push(skill);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [available]);

  const addSkill = () => {
    if (!pending) return;
    if (selectedLower.has(pending.toLowerCase())) return;
    onChange([...selected, pending]);
    setPending('');
  };

  const removeSkill = (name) => {
    onChange(selected.filter((entry) => entry !== name));
  };

  return (
    <div>
      {selected.length === 0 ? (
        <div className="small muted">{emptyMessage}</div>
      ) : (
        <div className="badge-row">
          {selected.map((name) => (
            <span key={name} className="skill-pill owned">
              {name}
              <button
                type="button"
                title={`Remove ${name}`}
                aria-label={`Remove ${name}`}
                onClick={() => removeSkill(name)}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="inline-fields mt-2">
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Filter the skill list</span>
          <input
            type="search"
            value={search}
            placeholder="Type to narrow the list..."
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="field-label">Add a skill</span>
          <select value={pending} onChange={(event) => setPending(event.target.value)}>
            <option value="">
              {grouped.length === 0 ? 'No skills left to add' : 'Select a skill...'}
            </option>
            {grouped.map(([category, entries]) => (
              <optgroup key={category} label={category}>
                {entries.map((skill) => (
                  <option key={skill.id} value={skill.name}>
                    {skill.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div>
          <button type="button" className="btn" onClick={addSkill} disabled={!pending}>
            Add skill
          </button>
        </div>
      </div>
    </div>
  );
}

export default SkillPicker;
