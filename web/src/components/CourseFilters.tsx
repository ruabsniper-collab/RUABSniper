import { useState } from "react";
import { CREDITS_OPTIONS, LOCATION_OPTIONS } from "../lib/courses";
import { DAY_LABELS } from "../lib/time";
import type { CatalogOptions } from "../lib/catalogOptions";
import type { ScheduleSet } from "../lib/schedule";
import { SearchIcon, SettingsIcon } from "./icons";

export type CourseFilterValues = {
  subjectCode: string; coreCodes: string[]; minRating: number | null; minRatingCount: number;
  creditsFilter: number | null; includeUnrated: boolean; requireRmpMatch: boolean; sortByRating: boolean;
  locations: string[]; filterDays: string[]; earliestStartText: string; latestEndText: string;
  hideConflicts: boolean; travelBuffer: number;
};
export const DEFAULT_COURSE_FILTERS: CourseFilterValues = {
  subjectCode: "", coreCodes: [], minRating: null, minRatingCount: 0, creditsFilter: null,
  includeUnrated: true, requireRmpMatch: false, sortByRating: false, locations: [], filterDays: [],
  earliestStartText: "", latestEndText: "", hideConflicts: false, travelBuffer: 30,
};
export function activeFilterCount(v: CourseFilterValues): number {
  return Number(Boolean(v.subjectCode)) + v.coreCodes.length + Number(v.minRating != null) + Number(v.minRatingCount > 0) +
    Number(v.creditsFilter != null) + Number(v.requireRmpMatch) + Number(v.sortByRating) + Number(v.locations.length > 0) +
    Number(v.filterDays.length > 0) + Number(Boolean(v.earliestStartText || v.latestEndText)) + Number(v.hideConflicts);
}
const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(v => v !== value) : [...values, value];

export function CourseFilters({ query, onQueryChange, value: v, onChange, options, optionsLoading, optionsError, onRetryOptions,
  schedules, activeScheduleId, onScheduleChange, scheduleName, scheduleBlocks }: {
  query: string; onQueryChange: (query: string) => void; value: CourseFilterValues; onChange: (patch: Partial<CourseFilterValues>) => void;
  options: CatalogOptions; optionsLoading: boolean; optionsError: boolean; onRetryOptions: () => void;
  schedules: ScheduleSet[]; activeScheduleId: string; onScheduleChange: (id: string) => void; scheduleName: string; scheduleBlocks: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = activeFilterCount(v);
  const reset = () => onChange(DEFAULT_COURSE_FILTERS);
  return <div className="course-discovery">
    <div className="discovery-toolbar">
      <div className="search-field discovery-search">
        <span className="discovery-search-icon" aria-hidden="true"><SearchIcon /></span>
        <input className="input search-input" aria-label="Search courses" placeholder="Course name, code, or index" value={query} onChange={e => onQueryChange(e.target.value)} spellCheck={false} />
        {query && <button className="search-clear" aria-label="Clear search" onClick={() => onQueryChange("")}>×</button>}
      </div>
      <button className={`discovery-filter-toggle ${expanded ? "is-open" : ""}`} aria-expanded={expanded} aria-controls="course-filter-panel" onClick={() => setExpanded(open => !open)}>
        <span aria-hidden="true"><SettingsIcon /></span><span>Filters</span>{count > 0 && <b>{count}</b>}
      </button>
    </div>

    <section className="catalog-pickers" aria-label="Browse by subject and core">
      <label className="subject-picker"><span>Subject</span>
        <select className="input" aria-label="Subject" value={v.subjectCode} disabled={optionsLoading} onChange={e => onChange({ subjectCode: e.target.value })}>
          <option value="">{optionsLoading ? "Loading subjects…" : "All subjects"}</option>
          {options.subjects.map(subject => <option key={subject.code} value={subject.code}>{subject.name} · {subject.code}</option>)}
        </select>
      </label>
      <fieldset className="core-picker">
        <legend>Core requirements <span>Tap to browse</span></legend>
        {optionsLoading ? <div className="core-loading" role="status">Loading core codes…</div> :
          <div className="core-code-grid">{options.cores.map(core => <button key={core.code} className={`core-code ${core.code.length > 4 ? "core-code-long" : ""} ${v.coreCodes.includes(core.code) ? "selected" : ""}`}
            title={core.name} aria-label={`${core.code}: ${core.name}`} aria-pressed={v.coreCodes.includes(core.code)} onClick={() => onChange({ coreCodes: toggle(v.coreCodes, core.code) })}>{core.code}</button>)}</div>}
        {v.coreCodes.length > 0 && <div className="core-selection-note"><p>{v.coreCodes.map(code => options.cores.find(core => core.code === code)?.name || code).join(" · ")}</p>
          <button onClick={() => onChange({ coreCodes: [] })}>Clear cores</button></div>}
        {!optionsLoading && options.cores.length === 0 && !optionsError && <p className="hint">No core codes listed for this semester.</p>}
        {v.coreCodes.length > 1 && <p className="hint">Showing classes that satisfy any selected core.</p>}
      </fieldset>
      {optionsError && <div className="catalog-options-error" role="status">Couldn't load subject and core choices. <button onClick={onRetryOptions}>Try again</button></div>}
    </section>

    {expanded && <section className="course-filter-panel" id="course-filter-panel" aria-label="Course filters">
      <div className="filter-panel-heading"><div><h2>Make it your schedule</h2><p>Changes apply as you choose.</p></div><button className="filter-reset" disabled={count === 0} onClick={reset}>Reset all</button></div>
      <fieldset className="filter-section"><legend>Professors & credits</legend>
        <div className="filter-control-grid">
          <label><span>Minimum rating</span><select className="input" value={v.minRating ?? ""} onChange={e => onChange({ minRating: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Any rating</option>{[3, 3.5, 4, 4.5].map(r => <option key={r} value={r}>{r}+ stars</option>)}</select></label>
          <label><span>Number of ratings</span><select className="input" value={v.minRatingCount} onChange={e => onChange({ minRatingCount: Number(e.target.value) })}>
            <option value={0}>Any count</option>{[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}+ ratings</option>)}</select></label>
          <label><span>Credits</span><select className="input" value={v.creditsFilter ?? ""} onChange={e => onChange({ creditsFilter: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">Any credits</option>{CREDITS_OPTIONS.map(n => <option key={n} value={n}>{n} credits</option>)}</select></label>
          <label><span>Sort results</span><select className="input" value={v.sortByRating ? "rating" : "default"} onChange={e => onChange({ sortByRating: e.target.value === "rating" })}>
            <option value="default">Course order</option><option value="rating">Highest rating</option></select></label>
        </div>
        {v.minRatingCount > 0 && <p className="filter-footnote">Every listed instructor needs {v.minRatingCount}+ ratings. Unknown counts are excluded.</p>}
        {v.minRating != null && v.minRatingCount === 0 && <label className="filter-switch"><span>Include professors without ratings</span><input type="checkbox" checked={v.includeUnrated} onChange={e => onChange({ includeUnrated: e.target.checked })} /></label>}
        <label className="filter-switch"><span>Only matched RMP profiles</span><input type="checkbox" checked={v.requireRmpMatch} onChange={e => onChange({ requireRmpMatch: e.target.checked })} /></label>
      </fieldset>

      <fieldset className="filter-section"><legend>Where & when</legend>
        <p className="filter-field-label">Campus / format</p><div className="filter-choice-wrap">
          <button className={`filter-choice ${!v.locations.length ? "selected" : ""}`} aria-pressed={!v.locations.length} onClick={() => onChange({ locations: [] })}>Anywhere</button>
          {LOCATION_OPTIONS.map(option => <button key={option.value} className={`filter-choice ${v.locations.includes(option.value) ? "selected" : ""}`} aria-pressed={v.locations.includes(option.value)} onClick={() => onChange({ locations: toggle(v.locations, option.value) })}>{option.label}</button>)}
        </div>
        <p className="filter-field-label">Allowed days</p><div className="filter-days" role="group" aria-label="Allowed days">
          {["M", "T", "W", "H", "F", "S", "U"].map(day => <button key={day} aria-pressed={v.filterDays.includes(day)} className={v.filterDays.includes(day) ? "selected" : ""} onClick={() => onChange({ filterDays: toggle(v.filterDays, day) })}>{DAY_LABELS[day]}</button>)}
        </div>
        <div className="filter-control-grid filter-time-controls">
          <label><span>Start no earlier than</span><input className="input" type="time" value={v.earliestStartText} onChange={e => onChange({ earliestStartText: e.target.value })} /></label>
          <label><span>End no later than</span><input className="input" type="time" value={v.latestEndText} onChange={e => onChange({ latestEndText: e.target.value })} /></label>
        </div>
      </fieldset>

      <fieldset className="filter-section"><legend>Your schedule</legend>
        <label className="filter-switch"><span>Hide schedule conflicts<small>{scheduleName || "My Schedule"} · {scheduleBlocks} blocks</small></span><input type="checkbox" checked={v.hideConflicts} onChange={e => onChange({ hideConflicts: e.target.checked })} /></label>
        {v.hideConflicts && <div className="filter-control-grid">
          {schedules.length > 1 && <label><span>Check against</span><select className="input" value={activeScheduleId} onChange={e => onScheduleChange(e.target.value)}>{schedules.map(schedule => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}</select></label>}
          <label><span>Cross-campus travel</span><select className="input" value={v.travelBuffer} onChange={e => onChange({ travelBuffer: Number(e.target.value) })}>
            <option value={0}>No buffer</option>{[15, 30, 45, 60].map(n => <option key={n} value={n}>{n} minutes</option>)}</select></label>
        </div>}
      </fieldset>
      <button className="btn filter-done" onClick={() => setExpanded(false)}>Done</button>
    </section>}
    {!expanded && count > 0 && <div className="filter-summary"><p>{[v.subjectCode && options.subjects.find(s => s.code === v.subjectCode)?.name, ...v.coreCodes,
      v.minRating != null && `${v.minRating}+ stars`, v.minRatingCount > 0 && `${v.minRatingCount}+ ratings`, v.creditsFilter != null && `${v.creditsFilter} credits`,
      v.sortByRating && "Highest rated", v.requireRmpMatch && "RMP profiles", v.locations.length > 0 && `${v.locations.length} locations`,
      v.filterDays.length > 0 && v.filterDays.map(day => DAY_LABELS[day]).join("/"), (v.earliestStartText || v.latestEndText) && "Time window", v.hideConflicts && "No conflicts"].filter(Boolean).join(" · ")}</p><button className="filter-reset" onClick={reset}>Clear all</button></div>}
  </div>;
}
