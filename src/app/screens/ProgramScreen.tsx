import { useMemo, useState } from "react";
import { Button, EmptyState, IconProgram, ListGroup, ListRow, Sheet, useToast } from "../../ui";
import { Section } from "../Shell";
import { navigate, useRoute } from "../router";
import { newCid } from "../../sync";
import { useSyncStore } from "../../sync/react";
import { updateSettings, useUserSettings } from "../../features/session/hooks";
import { buildFromTemplate, TEMPLATES, type TemplateDef } from "../../features/program/templates";
import { DayEditor } from "../../features/program/DayEditor";
import { ProgramOverview } from "../../features/program/ProgramOverview";
import { useExerciseIndex, usePrograms, useReconcileCompletions, useWriteProgram } from "../../features/program/useProgramData";
import { EQUIPMENT_LABEL } from "../../shared/domain";
import "../../features/program/program.css";

export function ProgramScreen() {
  const route = useRoute();
  const store = useSyncStore();
  const settings = useUserSettings();
  const exercises = useExerciseIndex();
  const { all, active } = usePrograms();
  const write = useWriteProgram();
  const [choosing, setChoosing] = useState(false);
  useReconcileCompletions(active);

  const dayId = route.query.get("day");
  const dayIndex = active && dayId ? active.data.days.findIndex((d) => d.dayId === dayId) : -1;

  if (active && dayIndex >= 0 && !choosing) {
    return (
      <DayEditor
        key={dayId}
        programCid={active.cid}
        program={active.data}
        day={active.data.days[dayIndex]!}
        index={dayIndex}
        settings={settings}
        exercises={exercises}
        write={write}
      />
    );
  }

  if (active && !choosing) {
    return (
      <ProgramOverview
        programCid={active.cid}
        program={active.data}
        settings={settings}
        exercises={exercises}
        write={write}
        onNewProgram={() => setChoosing(true)}
      />
    );
  }

  return (
    <TemplateChooser
      others={all.filter((p) => p.cid !== active?.cid)}
      hasActive={!!active}
      onCancel={active ? () => setChoosing(false) : undefined}
      onActivate={async (cid) => {
        if (store) await updateSettings(store, { activeProgramCid: cid });
        setChoosing(false);
        navigate("/program", { replace: true });
      }}
      onCreate={async (t) => {
        if (!store) return { unfilled: [] };
        const built = buildFromTemplate(t.id, exercises.list, settings.availableEquipment, newCid);
        const cid = newCid();
        await store.write("programs", cid, built.data);
        await updateSettings(store, { activeProgramCid: cid });
        setChoosing(false);
        navigate("/program", { replace: true });
        return built;
      }}
      equipmentLabel={
        settings.availableEquipment.length
          ? settings.availableEquipment.map((e) => EQUIPMENT_LABEL[e]).join(", ")
          : "a full gym (set your equipment in Settings)"
      }
    />
  );
}

function TemplateChooser({
  others,
  hasActive,
  onCancel,
  onActivate,
  onCreate,
  equipmentLabel,
}: {
  others: Array<{ cid: string; data: { name: string; days: unknown[] } }>;
  hasActive: boolean;
  onCancel?: () => void;
  onActivate: (cid: string) => Promise<void>;
  onCreate: (t: TemplateDef) => Promise<{ unfilled: Array<{ day: string; label: string }> }>;
  equipmentLabel: string;
}) {
  const [open, setOpen] = useState<TemplateDef | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const custom = useMemo(() => TEMPLATES.find((t) => t.id === "custom")!, []);

  return (
    <div className="screen">
      {!hasActive && (
        <EmptyState icon={<IconProgram />} title="No program yet">
          <p>A program is a list of days that you work through in order. When you finish or skip a day, the next one comes up. Days aren't tied to weekdays.</p>
        </EmptyState>
      )}
      {onCancel && (
        <Button variant="ghost" onClick={onCancel}>
          Back to current program
        </Button>
      )}

      {others.length > 0 && (
        <Section title="Your programs" id="prog-mine">
          <ListGroup label="Your programs">
            {others.map((p) => (
              <li key={p.cid}>
                <ListRow title={p.data.name} meta={`${p.data.days.length} days · tap to make active`} chevron onClick={() => void onActivate(p.cid)} />
              </li>
            ))}
          </ListGroup>
        </Section>
      )}

      <Section title="Start from a template" id="prog-templates">
        <ListGroup label="Templates">
          {TEMPLATES.filter((t) => t.id !== "custom").map((t) => (
            <li key={t.id}>
              <ListRow title={t.name} meta={t.meta} chevron onClick={() => setOpen(t)} />
            </li>
          ))}
          <li>
            <ListRow title="Start blank" meta="One empty day; name and fill your own" chevron onClick={() => setOpen(custom)} />
          </li>
        </ListGroup>
      </Section>

      <Sheet
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open?.id === "custom" ? "Blank program" : (open?.name ?? "")}
        description={
          open?.days.length
            ? `Days run in this order, then repeat. Starter exercises are common staples picked for ${equipmentLabel}; change any of them.`
            : "Start with an empty day and add exercises."
        }
        footer={
          <Button
            variant="primary"
            size="lg"
            block
            loading={busy}
            onClick={async () => {
              if (!open) return;
              setBusy(true);
              try {
                const res = await onCreate(open);
                setOpen(null);
                if (res.unfilled.length) {
                  toast.show({ message: `${res.unfilled.length} slot(s) had no match for your equipment and were left out.` });
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            {open?.id === "custom" ? "Create blank program" : "Use this template"}
          </Button>
        }
      >
        {open && open.days.length > 0 && (
          <ol className="queue">
            {open.days.map((d, i) => (
              <li key={d.name} className="queue__stop">
                <span className="queue__index num">{i + 1}</span>
                <span className="queue__text">
                  <span className="queue__name">{d.name}</span>
                  <span className="queue__focus">{d.focus}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Sheet>
    </div>
  );
}
