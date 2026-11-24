// Exercise detail: photos, how-to steps, body map, attributes, provenance, favorite, add-to-workout.
import { lazy, Suspense, useMemo, useState, type ComponentType } from "react";
import { useActiveWorkout } from "../../app/activeWorkout";
import { navigate, pathFor } from "../../app/router";
import { BodyMap, BodyMapLegend, involvementLevels, MuscleChips } from "../../bodymap";
import type { ExerciseImage, Muscle } from "../../shared/domain";
import { useRows, useSyncStore } from "../../sync/react";
import { ScreenAction } from "../../app/Shell";
import { Button, Card, Chip, EmptyState, IconButton, IconDumbbell, IconPlus, SectionHeader, useToast } from "../../ui";
import { useUserSettings } from "../session/hooks";
import { addExercise } from "../workout/ops";
import { CustomExerciseSheet } from "./CustomExerciseSheet";
import { IconStar } from "./ExerciseRow";
import { equipmentList, muscleList, PATTERN_LABEL, TRACKING_LABEL } from "./labels";
import { isStaple, isUsual } from "./model";
import { useExerciseSearch, useToggleFavorite } from "./useExerciseSearch";
import "./exercises.css";

// History is built by another feature; render it only if that module exists in this build.
type SlotModule = Record<string, unknown>;
const historyModules = import.meta.glob<SlotModule>("../progress/ExerciseHistory.tsx");
const historyLoader = Object.values(historyModules)[0];
type SlotProps = { exId: string };
const NoHistory: ComponentType<SlotProps> = () => null;
const ExerciseHistorySlot = historyLoader
  ? lazy<ComponentType<SlotProps>>(async () => {
      const m = await historyLoader();
      const C = (m.ExerciseHistorySlot ?? m.ExerciseHistory ?? m.default) as ComponentType<SlotProps> | undefined;
      return { default: C ?? NoHistory };
    })
  : null;

export function ExerciseDetail({ exId }: { exId: string }) {
  const xs = useExerciseSearch();
  const settings = useUserSettings();
  const toggleFavorite = useToggleFavorite();
  const store = useSyncStore();
  const toast = useToast();
  const { session } = useActiveWorkout();
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const sessionExercises = useRows("sessionExercises");
  const [selected, setSelected] = useState<Muscle | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const canonical = xs.resolve(exId);
  const ex = xs.get(exId);
  const levels = useMemo(() => (ex ? involvementLevels([ex]) : {}), [ex]);

  if (!ex) {
    return (
      <EmptyState
        icon={<IconDumbbell />}
        title={xs.ready ? "Exercise not found" : "Loading exercise"}
        action={xs.ready ? <Button onClick={() => navigate(pathFor("exercises"), { replace: true })}>All exercises</Button> : undefined}
      >
        {xs.ready && <p>It may have been removed from this device.</p>}
      </EmptyState>
    );
  }

  const images: ExerciseImage[] = (ex.catalog?.images ?? [])
    .filter((im) => im.source === "repdb" || settings.showCommunityImages)
    .sort((a, b) => (a.source === b.source ? 0 : a.source === "repdb" ? -1 : 1));
  const steps = (ex.catalog?.instructions ?? []).map((t) => t.trim()).filter(Boolean);
  const fav = xs.favorites.has(ex.exId);
  const usual = isUsual(xs.usage, ex.exId);
  const inSession = session ? sessionExercises.some((r) => r.data?.sessionCid === session.cid && r.data.exId === ex.exId) : false;

  const addToWorkout = async () => {
    if (!store || !session) return;
    setAdding(true);
    try {
      const order = sessionExercises.filter((r) => r.data?.sessionCid === session.cid).length;
      await addExercise(store, session.cid, ex.exId, order, { sessions, sets }, { settings });
      toast.show({ message: `Added to ${session.name}` });
    } finally {
      setAdding(false);
    }
  };

  const sources = ex.catalog?.sources ?? [];
  const provenance = ex.custom
    ? "Your custom exercise"
    : sources.length
      ? "Sources: " +
        sources.map((s) => (s.source === "repdb" ? "RepDB" : s.source === "curated" ? "curated by us" : "free-exercise-db")).join(", ")
      : null;

  return (
    <article className="exdetail" aria-labelledby="exdetail-name">
      {canonical !== exId && <p className="exdetail__note">This exercise was merged into {ex.name}.</p>}
      <header className="exdetail__head">
        <div className="exdetail__titles">
          <h2 id="exdetail-name" className="exdetail__name">
            {ex.name}
          </h2>
          <p className="exdetail__sub">
            {equipmentList(ex.equipment)} · {PATTERN_LABEL[ex.pattern]}
          </p>
          {(usual || isStaple(ex) || ex.custom) && (
            <div className="exdetail__marks">
              {usual && <Chip>Your usual · {xs.usage.frequency[ex.exId]} sessions</Chip>}
              {isStaple(ex) && <Chip>Staple</Chip>}
              {ex.custom && <Chip>Custom</Chip>}
            </div>
          )}
        </div>
        <IconButton
          variant="raised"
          size="lg"
          className={`exdetail__fav${fav ? " is-on" : ""}`}
          aria-pressed={fav}
          label={fav ? "Remove from favorites" : "Add to favorites"}
          icon={<IconStar filled={fav} />}
          onClick={() => void toggleFavorite(ex.exId)}
        />
      </header>

      {images.length > 0 && (
        <div className="exdetail__images">
          {images.map((im) => (
            <figure key={im.url} className="exdetail__figure">
              <img
                src={im.url}
                alt=""
                loading="lazy"
                decoding="async"
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const fig = e.currentTarget.closest("figure");
                  if (fig) fig.hidden = true;
                }}
              />
              <figcaption>{im.attribution}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <section className="exdetail__section" aria-labelledby="exdetail-howto">
        <SectionHeader level={3} id="exdetail-howto" title="How to" />
        <dl className="exdetail__brief">
          <dt>Muscles</dt>
          <dd>
            {muscleList(ex.primary) || "Not listed"}
            {ex.secondary.length > 0 && <span className="exdetail__secondary"> · also {muscleList(ex.secondary).toLowerCase()}</span>}
          </dd>
          <dt>Equipment</dt>
          <dd>{equipmentList(ex.equipment)}</dd>
        </dl>
        {steps.length > 0 ? (
          <ol className="exdetail__steps">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p className="exdetail__nosteps">No written steps for this exercise</p>
        )}
        {ex.notes && <p className="exdetail__notes">{ex.notes}</p>}
      </section>


      <section className="exdetail__section" aria-labelledby="exdetail-muscles">
        <SectionHeader level={3} id="exdetail-muscles" title="Muscles worked" meta="Tap a muscle to highlight it" />
        <Card className="exdetail__mapcard">
          <BodyMap levels={levels} selected={selected} onSelect={setSelected} className="exdetail__map" />
          <BodyMapLegend />
        </Card>
        <MuscleChips levels={levels} selected={selected} onSelect={setSelected} />
      </section>

      <section className="exdetail__section" aria-labelledby="exdetail-details">
        <SectionHeader level={3} id="exdetail-details" title="Details" />
        <dl className="exdetail__facts">
          <dt>Movement</dt>
          <dd>{PATTERN_LABEL[ex.pattern]}</dd>
          <dt>Tracking</dt>
          <dd>
            {TRACKING_LABEL[ex.tracking] ?? ex.tracking}
            {ex.unilateral ? " · one side at a time" : ""}
          </dd>
        </dl>
        {ex.aliases.length > 0 && (
          <div className="exdetail__aliases">
            <span className="exdetail__label">Also called</span>
            {ex.aliases.map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
          </div>
        )}
      </section>

      {ExerciseHistorySlot && (
        <Suspense fallback={null}>
          <ExerciseHistorySlot exId={ex.exId} />
        </Suspense>
      )}

      {provenance && <p className="exdetail__provenance">{provenance}</p>}

      {ex.customCid && (
        <Button block onClick={() => setEditing(true)}>
          Edit exercise
        </Button>
      )}

      {session && (
        <ScreenAction>
          <Button
            variant="primary"
            size="lg"
            block
            icon={<IconPlus />}
            loading={adding}
            disabled={inSession}
            onClick={() => void addToWorkout()}
          >
            {inSession ? `Already in ${session.name}` : `Add to ${session.name}`}
          </Button>
        </ScreenAction>
      )}

      {ex.customCid && (
        <CustomExerciseSheet open={editing} onClose={() => setEditing(false)} editCid={ex.customCid} onSaved={() => setEditing(false)} />
      )}
    </article>
  );
}
