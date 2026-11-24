// Archive, unarchive and delete programs. Workouts done from a program always stay in history;
// deleting the active program leaves no program active (Today then offers to pick one).
import { useState } from "react";
import { Section } from "../../app/Shell";
import type { ProgramData } from "../../shared/sync";
import { useRows, useSyncStore } from "../../sync/react";
import { Button, IconButton, IconMore, ListGroup, ListRow, Sheet, useToast } from "../../ui";
import { deleteProgram, restoreRows, setProgramArchived } from "../workout/ops";

type Target = { cid: string; data: ProgramData };

/** Archive / unarchive / delete with Undo toasts. */
export function useProgramActions() {
  const store = useSyncStore();
  const toast = useToast();
  const undo = (snap: Awaited<ReturnType<typeof deleteProgram>>) => () => {
    if (store) void restoreRows(store, snap);
  };
  return {
    archive: async (p: Target, archived: boolean) => {
      if (!store) return;
      const snap = await setProgramArchived(store, p.cid, archived);
      toast.show({ message: archived ? `Archived ${p.data.name}` : `${p.data.name} is back in your programs`, action: { label: "Undo", onAction: undo(snap) } });
    },
    remove: async (p: Target) => {
      if (!store) return;
      const snap = await deleteProgram(store, p.cid);
      toast.show({ message: `Deleted ${p.data.name}`, duration: 6000, action: { label: "Undo", onAction: undo(snap) } });
    },
  };
}

/** Confirm sheet for deleting a program; says what stays. */
export function DeleteProgramSheet({ program, active, onClose, onConfirm }: { program: Target | null; active: boolean; onClose: () => void; onConfirm: () => void }) {
  return (
    <Sheet
      open={program !== null}
      onClose={onClose}
      title="Delete this program?"
      description={
        program ? (
          <>
            {program.data.name} and its {program.data.days.length} {program.data.days.length === 1 ? "day" : "days"} are removed on every device. Workouts you did from it stay in your
            history.{active ? " No program will be active until you pick one." : ""}
          </>
        ) : null
      }
      footer={
        <div className="sheet-actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete program
          </Button>
        </div>
      }
    >
      <p className="small muted">Archive it instead to hide it and keep it. You can undo a delete for a few seconds.</p>
    </Sheet>
  );
}

/** Archive + delete for the active program, at the foot of its overview. */
export function ActiveProgramActions({ programCid, program }: { programCid: string; program: ProgramData }) {
  const actions = useProgramActions();
  const [confirm, setConfirm] = useState(false);
  const target = { cid: programCid, data: program };
  return (
    <div className="prog-manage">
      <Button variant="secondary" onClick={() => void actions.archive(target, true)}>
        Archive program
      </Button>
      <Button variant="ghost" className="prog-manage__delete" onClick={() => setConfirm(true)}>
        Delete program
      </Button>
      <DeleteProgramSheet
        program={confirm ? target : null}
        active
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void actions.remove(target);
        }}
      />
    </div>
  );
}

/** Inactive programs (tap to make active, ⋯ to archive/delete) and archived ones (⋯ to restore/delete). */
export function ProgramLists({ activeCid, onActivate }: { activeCid: string | null; onActivate: (cid: string) => void }) {
  const rows = useRows("programs");
  const actions = useProgramActions();
  const [menu, setMenu] = useState<Target | null>(null);
  const [confirm, setConfirm] = useState<Target | null>(null);
  const all = rows.filter((r): r is typeof r & { data: ProgramData } => !!r.data && r.cid !== activeCid);
  const live = all.filter((r) => !r.data.archived);
  const archived = all.filter((r) => r.data.archived);

  const row = (p: Target, meta: string, onClick?: () => void) => (
    <li key={p.cid} className="prog-slot">
      <ListRow title={p.data.name} meta={meta} chevron={!!onClick} onClick={onClick} />
      <span className="prog-slot__order">
        <IconButton label={`More for ${p.data.name}`} icon={<IconMore size={20} />} onClick={() => setMenu(p)} />
      </span>
    </li>
  );
  const days = (p: Target) => `${p.data.days.length} ${p.data.days.length === 1 ? "day" : "days"}`;

  return (
    <>
      {live.length > 0 && (
        <Section title="Your programs" id="prog-mine">
          <ListGroup label="Your programs" className="prog-list">
            {live.map((p) => row(p, `${days(p)} · tap to make active`, () => onActivate(p.cid)))}
          </ListGroup>
        </Section>
      )}
      {archived.length > 0 && (
        <Section title="Archived" id="prog-archived" meta="Hidden from Today. Workouts from them stay in your history.">
          <ListGroup label="Archived programs" className="prog-list">
            {archived.map((p) => row(p, days(p)))}
          </ListGroup>
        </Section>
      )}

      <Sheet open={menu !== null} onClose={() => setMenu(null)} title={menu?.data.name ?? ""}>
        {menu && (
          <div className="stack prog-menu">
            <Button
              variant="secondary"
              block
              onClick={() => {
                const p = menu;
                setMenu(null);
                void actions.archive(p, !p.data.archived);
              }}
            >
              {menu.data.archived ? "Unarchive" : "Archive"}
            </Button>
            <Button
              variant="danger"
              block
              onClick={() => {
                setConfirm(menu);
                setMenu(null);
              }}
            >
              Delete program
            </Button>
          </div>
        )}
      </Sheet>
      <DeleteProgramSheet
        program={confirm}
        active={false}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const p = confirm;
          setConfirm(null);
          if (p) void actions.remove(p);
        }}
      />
    </>
  );
}
