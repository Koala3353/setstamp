// "What do these numbers mean?": plain definitions for every number on the Progress screen.
import { useState } from "react";
import { Button, IconChevronRight, Sheet } from "../../ui";

const DEFINITIONS: Array<{ term: string; text: string }> = [
  {
    term: "Working sets",
    text: "Sets you marked done, not counting warm-ups. Drop sets and sets to failure count. Planned sets you didn't do never count.",
  },
  {
    term: "Volume",
    text: "Weight × reps added up over working sets. Warm-ups are left out. Assisted sets (like assisted pull-ups) record the help you got, not a load, so they add nothing. Neither do timed or plain bodyweight sets.",
  },
  {
    term: "Top set",
    text: "The heaviest working set of an exercise in one session, whatever its reps.",
  },
  {
    term: "Est. 1RM (estimated one-rep max)",
    text: "What you could probably lift once, estimated with the Epley formula: weight × (1 + reps ÷ 30). Only sets of 10 reps or fewer are used, because the estimate gets unreliable above that. A single you actually lifted is shown as is. It's an estimate, not a tested max.",
  },
  {
    term: "Records",
    text: "Your best for one exercise: heaviest weight at each rep count, best est. 1RM, most reps (bodyweight), least assistance (assisted), longest hold (timed) and best session volume. Each exercise is only compared with itself, so a dumbbell press never competes with a barbell press.",
  },
  {
    term: "Muscle sets (estimate)",
    text: "Each working set counts 1 set for every primary muscle of the exercise and ½ set for every secondary one. It shows roughly what you trained, not how hard, and says nothing about recovery, soreness or injury.",
  },
  {
    term: "This week",
    text: "Monday to now, in your local time.",
  },
  {
    term: "Units",
    text: "Each weight keeps the unit you typed. Switching kg and lb in Settings only changes how numbers are shown, so 45 lb never turns into 44.9.",
  },
];

export function MetricsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What do these numbers mean?"
      footer={
        <div className="sheet-actions">
          <Button variant="primary" onClick={onClose}>
            Got it
          </Button>
        </div>
      }
    >
      <dl className="defs">
        {DEFINITIONS.map((d) => (
          <div key={d.term} className="defs__item">
            <dt>{d.term}</dt>
            <dd>{d.text}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}

/** Ghost button that opens the definitions sheet. */
export function MetricsHelp({ label = "What do these numbers mean?" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" className="progress__help" trailingIcon={<IconChevronRight size={20} />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <MetricsSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
