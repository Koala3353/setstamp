// Export (JSON from the server, CSV built on the device) and the two delete flows.
// Deleting takes three deliberate steps: open the sheet, type the phrase, press the red button.
import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { SYNC_TABLES, type SyncRow } from "../../shared/sync";
import { wipeLocalUser } from "../../sync";
import { useRows, useSyncStatus, useSyncStore } from "../../sync/react";
import { Button, IconDownload, IconTrash, ListGroup, ListRow, SectionHeader, Sheet, TextField, useToast } from "../../ui";
import { useOnline, useSession } from "../session/SessionProvider";
import { useExerciseLookup } from "../workout/exerciseInfo";
import { buildSetsCsv } from "./csv";
import { dateStamp, downloadText, localExport, withPendingOps } from "./exportData";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function DataControls() {
  const store = useSyncStore();
  const { authenticated } = useSession();
  const online = useOnline();
  const status = useSyncStatus();
  const toast = useToast();
  const exportServer = useAction(api.account.exportData);
  const sessions = useRows("sessions");
  const sessionExercises = useRows("sessionExercises");
  const sets = useRows("sets");
  const lookup = useExerciseLookup();
  const [busy, setBusy] = useState<"json" | null>(null);
  const [sheet, setSheet] = useState<"data" | "account" | null>(null);
  const canReachServer = online && authenticated;
  const doneSets = sets.filter((r) => r.data?.done).length;

  async function exportJson() {
    if (!store) return;
    setBusy("json");
    try {
      const pending = (await store.getOutbox()).map((e) => e.op);
      const now = Date.now();
      let body: unknown;
      if (canReachServer) {
        body = withPendingOps(await exportServer({}), pending);
      } else {
        const rows: SyncRow[] = SYNC_TABLES.flatMap((t) => [...store.list(t)].map(({ dirty: _d, ...r }) => r));
        body = localExport(rows, pending, now);
      }
      downloadText(`setstamp-export-${dateStamp(now)}.json`, JSON.stringify(body, null, 2), "application/json");
      toast.show({
        message: canReachServer ? "Export downloaded" : "Exported this device's copy (offline)",
      });
    } catch (e) {
      toast.show({ message: `Export failed: ${errText(e)}`, tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  function exportCsv() {
    const csv = buildSetsCsv({ sessions, sessionExercises, sets }, (id) => lookup(id).name);
    downloadText(`setstamp-sets-${dateStamp(Date.now())}.csv`, csv, "text/csv;charset=utf-8");
    toast.show({
      message: `CSV downloaded: ${doneSets} ${doneSets === 1 ? "set" : "sets"}`,
    });
  }

  return (
    <>
      <ListGroup label="Your data">
        <li>
          <ListRow
            title="Export everything (JSON)"
            meta={
              canReachServer
                ? `Every row you've synced, plus ${status.pending ? `${status.pending} change${status.pending === 1 ? "" : "s"} still on this device` : "anything still waiting to sync"}.`
                : "Offline: exports this device's copy, including unsynced changes."
            }
            leading={<IconDownload />}
            trailing={busy === "json" ? "Preparing…" : undefined}
            onClick={busy ? undefined : () => void exportJson()}
            disabled={!store || busy !== null}
          />
        </li>
        <li>
          <ListRow
            title="Export sets (CSV)"
            meta="One row per set: date, exercise, weight as you typed it, reps and more. Works offline."
            leading={<IconDownload />}
            onClick={exportCsv}
            disabled={!store || doneSets === 0}
          />
        </li>
      </ListGroup>
      <p className="muted small">Exports contain only your own data, never the exercise catalog.</p>

      <div className="ui-hazard datadelete">
        <SectionHeader level={3} title="Delete" meta="Permanent. Each step asks you to confirm by typing." />
        <ListGroup label="Delete" className="danger-list">
          <li>
            <ListRow
              title="Delete all workout data"
              meta="Workouts, sets, programs, custom exercises and settings. Your account stays."
              leading={<IconTrash />}
              onClick={() => setSheet("data")}
              chevron
            />
          </li>
          <li>
            <ListRow
              title="Delete account"
              meta="Everything above, plus your sign-in."
              leading={<IconTrash />}
              onClick={() => setSheet("account")}
              chevron
            />
          </li>
        </ListGroup>
      </div>

      <DeleteDataSheet open={sheet === "data"} onClose={() => setSheet(null)} canReachServer={canReachServer} />
      <DeleteAccountSheet open={sheet === "account"} onClose={() => setSheet(null)} canReachServer={canReachServer} />
    </>
  );
}

/** Text field that must match `phrase` exactly before the action unlocks. */
function PhraseField({ phrase, value, onChange, id }: { phrase: string; value: string; onChange: (v: string) => void; id: string }) {
  const matched = value.trim() === phrase;
  return (
    <TextField
      id={id}
      className="confirm-field"
      label={
        <>
          Type <strong className="confirm-field__phrase">{phrase}</strong> to confirm
        </>
      }
      hint={matched ? "Matches. The delete button is unlocked." : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      enterKeyHint="done"
    />
  );
}

function DeleteDataSheet({ open, onClose, canReachServer }: { open: boolean; onClose: () => void; canReachServer: boolean }) {
  const store = useSyncStore();
  const deleteAll = useMutation(api.account.deleteAllData);
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim() === "DELETE";

  const close = () => {
    if (busy) return;
    setTyped("");
    setError(null);
    onClose();
  };

  async function run() {
    if (!ok || !store || !canReachServer) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAll({});
      // The store has no in-place reset, so drop this user's local database and reload: the
      // session opens a fresh, empty store and pulls (nothing) from the server.
      await wipeLocalUser(store.userKey);
      window.location.reload();
    } catch (e) {
      setBusy(false);
      setError(errText(e));
      toast.show({ message: "Couldn't delete your data", tone: "error" });
    }
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Delete all workout data?"
      description="This permanently removes every workout, set, program, custom exercise, favorite and setting from the server and from this device. Your account stays, so you can start fresh."
      footer={
        <div className="sheet-actions confirm-actions">
          <Button onClick={close} disabled={busy}>
            Keep my data
          </Button>
          <Button variant="danger" onClick={() => void run()} disabled={!ok || !canReachServer} loading={busy}>
            Delete all data
          </Button>
        </div>
      }
    >
      <div className="stack ui-hazard">
        <ul className="confirm-notes">
          <li>There's no undo. Export first if you might want it later.</li>
          <li>Other devices keep their own copy until you sign out there and choose to remove data from that device.</li>
          {!canReachServer && <li className="confirm-notes__warn">You're offline. Deleting needs a connection to the server.</li>}
        </ul>
        <PhraseField id="confirm-delete-data" phrase="DELETE" value={typed} onChange={setTyped} />
        {error && (
          <p className="confirm-notes__warn" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

const ACCOUNT_PHRASE = "DELETE MY ACCOUNT";

function DeleteAccountSheet({ open, onClose, canReachServer }: { open: boolean; onClose: () => void; canReachServer: boolean }) {
  const deleteAccount = useMutation(api.account.deleteAccount);
  const { signOut, email } = useSession();
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = typed.trim() === ACCOUNT_PHRASE && understood;

  const close = () => {
    if (busy) return;
    setTyped("");
    setUnderstood(false);
    setError(null);
    onClose();
  };

  async function run() {
    if (!ok || !canReachServer) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({});
    } catch (e) {
      setBusy(false);
      setError(errText(e));
      return;
    }
    // The account is gone; clear this device too. Sign-out may fail (session already revoked).
    await signOut({ wipe: true }).catch(() => {});
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Delete your account?"
      description={`This permanently deletes ${email ?? "your account"}, your sign-in and every workout, set, program and setting. It can't be undone, and nobody can recover it for you.`}
      footer={
        <div className="sheet-actions confirm-actions">
          <Button onClick={close} disabled={busy}>
            Keep my account
          </Button>
          <Button variant="danger" onClick={() => void run()} disabled={!ok || !canReachServer} loading={busy}>
            Delete account forever
          </Button>
        </div>
      }
    >
      <div className="stack ui-hazard">
        <ul className="confirm-notes">
          <li>You'll be signed out here and this device's copy is erased.</li>
          <li>
            Other signed-in devices are signed out the next time they talk to the server. Their saved copy stays until you sign out there
            and choose to remove it.
          </li>
          <li>You can sign up again with the same email, but you'll start from nothing.</li>
          {!canReachServer && <li className="confirm-notes__warn">You're offline. Deleting needs a connection to the server.</li>}
        </ul>
        <label className="confirm-check">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <span>I understand my account and data are deleted permanently.</span>
        </label>
        <PhraseField id="confirm-delete-account" phrase={ACCOUNT_PHRASE} value={typed} onChange={setTyped} />
        {error && (
          <p className="confirm-notes__warn" role="alert">
            Couldn't delete the account: {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
