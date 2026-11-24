// Search + filter + results list shared by the Exercises tab and the ExercisePicker sheet.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { pathFor, href as hrefFor, navigate } from "../../app/router";
import { EQUIPMENT_LABEL, MUSCLE_INFO, type Muscle } from "../../shared/domain";
import type { SearchResult } from "../../search";
import { Button, EmptyState, IconClose, IconPlus, IconSearch, SectionHeader, SkeletonRows } from "../../ui";
import { useUserSettings } from "../session/hooks";
import { CustomExerciseSheet } from "./CustomExerciseSheet";
import { ExerciseRow } from "./ExerciseRow";
import { FilterBar } from "./FilterBar";
import { applyRelaxed, EMPTY_FILTERS, hasFacetFilters, toSearchFilters, type FilterState } from "./filters";
import { canDo, isStaple, isUsual, passesFilters, rankSubstitutes, recentExIds, type ExerciseEntry } from "./model";
import { useExerciseSearch, useToggleFavorite } from "./useExerciseSearch";
import "./exercises.css";

const PAGE = 50;

export type ExerciseBrowserProps = {
  /** navigate: rows link to the detail screen. pick: rows call onPick / toggle selection. */
  mode: "navigate" | "pick";
  onPick?: (exId: string) => void;
  /** Multi-select (pick mode): rows toggle membership in `selected`. */
  selected?: readonly string[];
  onToggleSelected?: (exId: string) => void;
  substituteFor?: string;
  sessionMuscles?: readonly Muscle[];
  autoFocus?: boolean;
  /** Unique id for the search input. */
  inputId: string;
};

type Row = { ex: ExerciseEntry; why?: string };

export function ExerciseBrowser({
  mode,
  onPick,
  selected,
  onToggleSelected,
  substituteFor,
  sessionMuscles,
  autoFocus,
  inputId,
}: ExerciseBrowserProps) {
  const xs = useExerciseSearch({ sessionMuscles });
  const settings = useUserSettings();
  const toggleFavorite = useToggleFavorite();
  const available = settings.availableEquipment;
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setLimit(PAGE), [q, filters]);
  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);

  const target = substituteFor ? xs.get(substituteFor) : undefined;
  const searchFilters = useMemo(() => toSearchFilters(filters), [filters]);
  const query = q.trim();
  const myEquip = filters.myEquipment && available.length > 0;
  const filtering = hasFacetFilters(filters) || myEquip;

  // Full ranked list (the catalog is ~1k rows); rendering is capped below.
  const resp = useMemo(
    () =>
      xs.run(query, {
        filters: searchFilters,
        limit: Math.max(1, xs.entries.length),
      }),
    [xs, query, searchFilters],
  );

  const { rows, hiddenByEquipment } = useMemo(() => {
    let list: Row[];
    if (target && !query) {
      const pool = xs.entries.filter((e) => !searchFilters || passesFilters(e, searchFilters));
      list = rankSubstitutes(target, pool, {
        availableEquipment: available,
        usage: xs.usage,
        favorites: xs.favorites,
      }).map((s) => ({ ex: s.exercise, why: s.why }));
    } else {
      list = resp.results.map((r: SearchResult<ExerciseEntry>) => ({
        ex: r.exercise,
      }));
    }
    if (!myEquip) return { rows: list, hiddenByEquipment: 0 };
    const kept = list.filter((r) => canDo(r.ex, available));
    return { rows: kept, hiddenByEquipment: list.length - kept.length };
  }, [target, query, xs, searchFilters, available, resp, myEquip]);

  const activate = (exId: string) => {
    if (mode === "navigate") navigate(pathFor("exercise", { exId }));
    else if (onToggleSelected) onToggleSelected(exId);
    else onPick?.(exId);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const top = rows[0];
    if (top) activate(top.ex.exId);
  };

  const renderRow = (r: Row) => (
    <ExerciseRow
      key={r.ex.exId}
      ex={r.ex}
      why={r.why}
      usual={isUsual(xs.usage, r.ex.exId)}
      staple={isStaple(r.ex)}
      favorite={xs.favorites.has(r.ex.exId)}
      onToggleFavorite={toggleFavorite}
      href={mode === "navigate" ? hrefFor(pathFor("exercise", { exId: r.ex.exId })) : undefined}
      onActivate={activate}
      checked={selected ? selected.includes(r.ex.exId) : undefined}
    />
  );

  const interpreted = resp.interpreted;
  const interpretedParts =
    query && (interpreted.equipment.length || interpreted.muscles.length || interpreted.noEquipment)
      ? [
          ...interpreted.text.map((t) => `“${t}”`),
          ...interpreted.equipment.map((e) => EQUIPMENT_LABEL[e].toLowerCase()),
          ...interpreted.muscles.map((m) => MUSCLE_INFO[m].label.toLowerCase()),
          ...(interpreted.noEquipment ? ["no equipment"] : []),
        ]
      : [];

  const suggestions: Array<{ label: string; run: () => void }> = [];
  if (!(target && !query)) {
    for (const s of resp.suggestions) {
      suggestions.push({
        label: s.label,
        run: () => {
          if (s.apply.filters !== undefined || s.kind === "relax_filter") setFilters(applyRelaxed(filters, s.apply.filters ?? {}));
          if (s.apply.query !== undefined) setQ(s.apply.query);
        },
      });
    }
  }
  if (myEquip && hiddenByEquipment > 0 && rows.length < 3) {
    suggestions.unshift({
      label: `Include equipment you don't have (${hiddenByEquipment})`,
      run: () => setFilters({ ...filters, myEquipment: false }),
    });
  }

  // Browse (no query, no filters): favorites and recent first.
  const browsing = !query && !filtering && !target;
  const favRows = browsing
    ? [...xs.favorites].flatMap((id) => {
        const ex = xs.get(id);
        return ex ? [{ ex }] : [];
      })
    : [];
  const recentRows = browsing
    ? recentExIds(xs.usage, 8).flatMap((id) => {
        const ex = xs.get(id);
        return ex ? [{ ex }] : [];
      })
    : [];

  const listTitle = target && !query ? `Swaps for ${target.name}` : browsing ? "All exercises" : "Results";
  const visible = rows.slice(0, limit);

  return (
    <div className={`exbrowser exbrowser--${mode}`}>
      <div className="exbrowser__top">
        <form role="search" className="search" onSubmit={onSubmit}>
          <label htmlFor={inputId} className="sr-only">
            Search exercises
          </label>
          <IconSearch className="search__icon" size={22} />
          <input
            ref={inputRef}
            id={inputId}
            className="search__input"
            type="search"
            inputMode="search"
            enterKeyHint={mode === "pick" ? "done" : "search"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Bench, rdl, dumbbell chest…"
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
          />
          {q && (
            <button
              type="button"
              className="search__clear"
              aria-label="Clear search"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
            >
              <IconClose size={20} />
            </button>
          )}
        </form>
        <FilterBar value={filters} onChange={setFilters} canFilterMyEquipment={available.length > 0} />
        {interpretedParts.length > 0 && (
          <p className="exbrowser__interp" aria-live="polite">
            Showing {interpretedParts.join(" · ")}
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="exbrowser__suggest" role="group" aria-label="Suggestions">
            {suggestions.map((s) => (
              <button key={s.label} type="button" className="ui-fchip" onClick={s.run}>
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!xs.ready ? (
        <section className="exsection" aria-label="Loading exercises">
          <p className="exbrowser__interp">Loading exercises. The catalog downloads once, then search works offline.</p>
          <SkeletonRows count={6} label="Loading exercises" />
        </section>
      ) : (
        <>
          {favRows.length > 0 && <ResultSection title="Favorites">{favRows.map(renderRow)}</ResultSection>}
          {recentRows.length > 0 && <ResultSection title="Recent">{recentRows.map(renderRow)}</ResultSection>}
          {rows.length === 0 ? (
            <EmptyState
              icon={<IconSearch />}
              title={query ? `Nothing matches “${query}”` : "No exercises match these filters"}
              action={
                <Button icon={<IconPlus />} onClick={() => setCreating(true)}>
                  {query ? `Create “${query}”` : "Create custom exercise"}
                </Button>
              }
            />
          ) : (
            <ResultSection
              title={listTitle}
              count={rows.length}
              aside={
                <Button variant="ghost" icon={<IconPlus />} onClick={() => setCreating(true)} className="exsection__new">
                  Custom
                </Button>
              }
            >
              {visible.map(renderRow)}
            </ResultSection>
          )}
          {rows.length > limit && (
            <Button block onClick={() => setLimit((n) => n + PAGE)}>
              Show more ({rows.length - limit} left)
            </Button>
          )}
          {mode === "navigate" && (
            <p className="exbrowser__credit">
              Exercise data by{" "}
              <a href="https://repdb.co" target="_blank" rel="noopener noreferrer">
                RepDB (repdb.co)
              </a>
            </p>
          )}
        </>
      )}

      <CustomExerciseSheet
        open={creating}
        onClose={() => setCreating(false)}
        initialName={query}
        onSaved={(exId) => {
          setCreating(false);
          setQ("");
          if (mode === "pick") activate(exId);
          else navigate(pathFor("exercise", { exId }));
        }}
        onUseExisting={(exId) => {
          setCreating(false);
          activate(exId);
        }}
      />
    </div>
  );
}

function ResultSection({ title, count, aside, children }: { title: string; count?: number; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="exsection">
      <SectionHeader
        level={3}
        title={title}
        meta={count !== undefined ? `${count} ${count === 1 ? "exercise" : "exercises"}` : undefined}
        aside={aside}
      />
      <ul className="exlist">{children}</ul>
    </section>
  );
}
