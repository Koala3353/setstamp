// Account rows for Settings: who's signed in, sync problems, sign out (with unsynced-changes warning).
import { useState } from "react";
import { Button, IconAlert, ListRow, Sheet, Switch } from "../../ui";
import { useSyncStatus, useSyncStore } from "../../sync/react";
import { useOnline, useSession } from "./SessionProvider";
import { openSyncIssues } from "./SyncIssues";
import "./session.css";

/** List items for a <ListGroup>: account, sync problems (if any), sign out. */
export function AccountRows() {
  const { email, authenticated } = useSession();
  const status = useSyncStatus();
  const [open, setOpen] = useState(false);
  return (
    <>
      <li>
        <ListRow
          leading={
            <span className="acct-plate" aria-hidden="true">
              {(email ?? "?").slice(0, 1).toUpperCase()}
            </span>
          }
          title={email ?? "Signed in"}
          meta={
            authenticated
              ? "Backed up and syncing across your devices."
              : "Using data saved on this device. Sync resumes when you're back online."
          }
        />
      </li>
      {(status.failed > 0 || status.state === "error") && (
        <li>
          <ListRow
            className="acct-problem"
            leading={<IconAlert />}
            title="Sync problems"
            meta={status.failed ? `${status.failed} ${status.failed === 1 ? "change" : "changes"} couldn't sync` : "Last sync failed"}
            onClick={openSyncIssues}
            chevron
          />
        </li>
      )}
      <li>
        <ListRow title="Sign out" onClick={() => setOpen(true)} chevron />
        <SignOutSheet open={open} onClose={() => setOpen(false)} />
      </li>
    </>
  );
}

export function SignOutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { signOut } = useSession();
  const store = useSyncStore();
  const status = useSyncStatus();
  const online = useOnline();
  const [wipe, setWipe] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = status.pending;
  const unsynced = pending > 0 || status.failed > 0;
  const count = pending + status.failed;

  async function doSignOut() {
    setBusy(true);
    try {
      await signOut({ wipe });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Sign out"
      description={
        unsynced
          ? `${count} ${count === 1 ? "change hasn't" : "changes haven't"} synced yet.${wipe ? " Signing out now and removing data from this device loses them." : ""}`
          : "Everything on this device has synced."
      }
      footer={
        <div className="sheet-actions">
          {unsynced ? (
            <Button onClick={() => store?.kick()} disabled={!online || status.state === "syncing"} loading={status.state === "syncing"}>
              {online ? "Sync now" : "Offline"}
            </Button>
          ) : (
            <Button onClick={onClose}>Cancel</Button>
          )}
          <Button variant="danger" onClick={doSignOut} loading={busy}>
            {unsynced ? "Sign out anyway" : "Sign out"}
          </Button>
        </div>
      }
    >
      <div className="ui-list">
        <Switch
          checked={wipe}
          onChange={setWipe}
          label="Remove my data from this device"
          description="Recommended on shared devices. Synced data stays in your account."
        />
      </div>
    </Sheet>
  );
}
