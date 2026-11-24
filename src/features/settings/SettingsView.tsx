// Settings: units, body and gym, program preferences, appearance, images, sync, data, about.
// Every preference lives in the synced settings row (cid "settings") except the theme, which is
// per device.
import { useState } from "react";
import pkg from "../../../package.json";
import { Section } from "../../app/Shell";
import { useThemePref, type ThemePref } from "../../app/theme";
import { EQUIPMENT, EQUIPMENT_LABEL, toKg, type Equipment, type Unit } from "../../shared/domain";
import type { SettingsData } from "../../shared/sync";
import { fmtNum, kgToDisplay } from "../../logic/units";
import { useFailedOps, useSyncStatus, useSyncStore } from "../../sync/react";
import {
  Button,
  Card,
  ChipRow,
  FilterChip,
  IconAlert,
  IconCheck,
  IconClose,
  IconCloudOff,
  IconDevice,
  IconPlus,
  IconSync,
  ListGroup,
  ListRow,
  Segmented,
  Stat,
  StatGrid,
  Stepper,
  Switch,
  TextField,
} from "../../ui";
import { Credits } from "../exercises/Credits";
import { AccountRows } from "../session/AccountSection";
import { useUpdateSettings, useUserSettings } from "../session/hooks";
import { useOnline } from "../session/SessionProvider";
import { openSyncIssues } from "../session/SyncIssues";
import { useTutorial } from "../tutorial";
import { DataControls } from "./DataControls";
import { isIOS, isStandalone, promptInstall, useInstallState } from "./install";
import "./settings.css";

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
const LB_PLATES = [45, 35, 25, 10, 5, 2.5];
const LB_BAR_KG = toKg(45, "lb");

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => Math.abs(v - [...b].sort((x, y) => x - y)[i]) < 0.01);

/**
 * Switching units also swaps the bar and plates, but only while they are still the other unit's
 * standard set; anything the user customised is kept. Without this a lb user gets a "44 lb" bar
 * and kg plates in the plate calculator.
 */
export function unitChange(s: { barKg: number; platesKg: number[] }, unit: Unit) {
  const lbPlatesKg = LB_PLATES.map((p) => toKg(p, "lb"));
  const patch: { unit: Unit; barKg?: number; platesKg?: number[] } = { unit };
  if (unit === "lb") {
    if (Math.abs(s.barKg - 20) < 0.01) patch.barKg = LB_BAR_KG;
    if (sameSet(s.platesKg, KG_PLATES)) patch.platesKg = lbPlatesKg;
  } else {
    if (Math.abs(s.barKg - LB_BAR_KG) < 0.01) patch.barKg = 20;
    if (sameSet(s.platesKg, lbPlatesKg)) patch.platesKg = [...KG_PLATES];
  }
  return patch;
}

export function SettingsView() {
  const s = useUserSettings();
  const update = useUpdateSettings();
  const [theme, setTheme] = useThemePref();

  return (
    <div className="screen settings">
      <Section title="Units" id="set-units">
        <Segmented<Unit>
          label="Weight unit"
          value={s.unit}
          onChange={(unit) => void update(unitChange(s, unit))}
          options={[
            { value: "kg", label: "Kilograms" },
            { value: "lb", label: "Pounds" },
          ]}
        />
        <p className="muted small">
          Changes how weights are shown and the unit new sets start in. Sets you've already logged keep the unit you typed, so 45 lb stays
          45 lb.
        </p>
      </Section>

      <Section title="Appearance" id="set-appearance">
        <Segmented<ThemePref>
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
        <p className="muted small">Theme is saved on this device only.</p>
      </Section>

      <Section title="Body and gym" id="set-body">
        <div className="stack">
          <KgStepper
            key={`bw-${s.unit}`}
            label="Bodyweight"
            kg={s.bodyweightKg}
            unit={s.unit}
            step={s.unit === "kg" ? 0.5 : 1}
            max={s.unit === "kg" ? 300 : 660}
            hint="Optional. Saved with each workout you start, for your own records."
            onChange={(bodyweightKg) => void update({ bodyweightKg })}
          />
          <Stepper
            label="Default rest between sets"
            value={s.defaultRestSec}
            onChange={(v) => v !== null && void update({ defaultRestSec: v })}
            step={15}
            min={0}
            max={900}
            unit="s"
            inputMode="numeric"
          />
          <KgStepper
            key={`bar-${s.unit}`}
            label="Empty barbell"
            kg={s.barKg}
            unit={s.unit}
            step={s.unit === "kg" ? 2.5 : 5}
            max={s.unit === "kg" ? 60 : 135}
            hint="Used by the plate calculator."
            onChange={(barKg) => barKg !== null && void update({ barKg })}
          />
          <PlatesEditor platesKg={s.platesKg} unit={s.unit} onChange={(platesKg) => void update({ platesKg })} />
        </div>
      </Section>

      <Section title="Equipment you have" id="set-equipment">
        <EquipmentPicker value={s.availableEquipment} onChange={(availableEquipment) => void update({ availableEquipment })} />
      </Section>

      <Section title="Program suggestions" id="set-program">
        <div className="stack">
          <div className="field">
            <span className="field__label">Goal</span>
            <Segmented<"none" | NonNullable<SettingsData["goal"]>>
              label="Goal"
              value={s.goal ?? "none"}
              onChange={(g) => void update({ goal: g === "none" ? null : g })}
              options={[
                { value: "none", label: "Not set" },
                { value: "strength", label: "Strength" },
                { value: "hypertrophy", label: "Muscle" },
                { value: "general", label: "General" },
              ]}
            />
          </div>
          <div className="field">
            <span className="field__label">Typical session length</span>
            <Segmented<string>
              label="Typical session length"
              value={s.sessionMinutes === null ? "none" : String(s.sessionMinutes)}
              onChange={(v) => void update({ sessionMinutes: v === "none" ? null : Number(v) })}
              options={[
                { value: "none", label: "Any" },
                ...[30, 45, 60, 75, 90].map((m) => ({
                  value: String(m),
                  label: `${m}`,
                })),
              ]}
            />
          </div>
          <p className="muted small">
            Session length is in minutes: program days estimated to run longer get flagged. Your goal is saved for program suggestions.
          </p>
        </div>
      </Section>

      <Section title="Exercise images" id="set-images">
        <div className="ui-list">
          <Switch
            checked={s.showCommunityImages}
            onChange={(showCommunityImages) => void update({ showCommunityImages })}
            label="Show community exercise images"
            description="Some exercises show photos from the free-exercise-db project on GitHub. Who took them and under what terms isn't verified, so you can turn them off. They load from GitHub, so they also need a connection."
          />
        </div>
      </Section>

      <Section title="Account" id="set-account">
        <ListGroup label="Account">
          <AccountRows />
        </ListGroup>
      </Section>

      <Section title="Sync" id="set-sync">
        <SyncDetails />
      </Section>

      <Section title="Your data" id="set-data">
        <DataControls />
      </Section>

      <Section title="Help" id="set-help">
        <HelpRows />
      </Section>

      <Section title="About" id="set-about">
        <About />
        <Credits />
      </Section>
    </div>
  );
}

/** Stepper over a kg value shown in `unit`. Keeps what you type until you leave the screen. */
function KgStepper({
  label,
  kg,
  unit,
  step,
  max,
  hint,
  onChange,
}: {
  label: string;
  kg: number | null;
  unit: Unit;
  step: number;
  max: number;
  hint?: string;
  onChange: (kg: number | null) => void;
}) {
  const [draft, setDraft] = useState<number | null>(() => kgToDisplay(kg, unit));
  return (
    <Stepper
      label={label}
      value={draft}
      onChange={(v) => {
        setDraft(v);
        onChange(v === null ? null : toKg(v, unit));
      }}
      step={step}
      min={0}
      max={max}
      unit={unit}
      inputMode="decimal"
      hint={hint}
    />
  );
}

function PlatesEditor({ platesKg, unit, onChange }: { platesKg: number[]; unit: Unit; onChange: (kg: number[]) => void }) {
  const [adding, setAdding] = useState("");
  const shown = [...platesKg].sort((a, b) => b - a).map((kg) => ({ kg, label: fmtNum(kgToDisplay(kg, unit, 0.05)) }));
  const add = () => {
    const v = Number(adding.replace(",", "."));
    if (!(v > 0) || v > 100) return;
    const kg = toKg(v, unit);
    if (!platesKg.some((p) => Math.abs(p - kg) < 0.01)) onChange([...platesKg, kg].sort((a, b) => b - a));
    setAdding("");
  };
  return (
    <fieldset className="plates">
      <legend className="field__label">Plate sizes you can load (assumed in pairs, as many as needed)</legend>
      {shown.length === 0 ? (
        <p className="muted small">No plates: the plate calculator will only show the bar.</p>
      ) : (
        <ul className="plates__list">
          {shown.map((p) => (
            <li key={p.kg}>
              <button
                type="button"
                className="plates__chip"
                aria-label={`Remove ${p.label} ${unit} plate`}
                onClick={() => onChange(platesKg.filter((x) => x !== p.kg))}
              >
                <span className="num">{p.label}</span> <span className="plates__unit">{unit}</span>
                <IconClose size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="plates__add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextField
          id="plate-add"
          label={`Add a plate, in ${unit}`}
          hideLabel
          inputMode="decimal"
          placeholder={`e.g. ${unit === "kg" ? "0.5" : "1.25"}`}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
        />
        <Button type="submit" icon={<IconPlus />} disabled={!(Number(adding.replace(",", ".")) > 0)}>
          Add {unit}
        </Button>
      </form>
      <div className="plates__presets">
        <Button variant="ghost" onClick={() => onChange([...KG_PLATES])}>
          Standard kg set
        </Button>
        <Button variant="ghost" onClick={() => onChange(LB_PLATES.map((p) => toKg(p, "lb")))}>
          Standard lb set
        </Button>
      </div>
    </fieldset>
  );
}

const PICKABLE = EQUIPMENT.filter((e) => e !== "other");

function EquipmentPicker({ value, onChange }: { value: Equipment[]; onChange: (v: Equipment[]) => void }) {
  const full = value.length === 0;
  const toggle = (e: Equipment, on: boolean) => {
    const next = on ? [...value, e] : value.filter((x) => x !== e);
    onChange(PICKABLE.filter((x) => next.includes(x)));
  };
  return (
    <div className="stack">
      <ChipRow label="Equipment you have">
        <FilterChip selected={full} onChange={() => onChange([])}>
          Full gym
        </FilterChip>
        {PICKABLE.map((e) => (
          <FilterChip key={e} selected={!full && value.includes(e)} onChange={(on) => toggle(e, on)}>
            {EQUIPMENT_LABEL[e]}
          </FilterChip>
        ))}
      </ChipRow>
      <p className="muted small">
        {full
          ? "Full gym: all exercises are included. Pick items to limit substitutions and suggestions to what you have."
          : "Substitutions and suggestions stick to these. Bodyweight exercises are always allowed. Tap Full gym to clear."}
      </p>
    </div>
  );
}

const STATE_LABEL = {
  offline: "Offline: changes are saved on this device",
  saved_local: "Saved on this device, waiting to sync",
  syncing: "Syncing…",
  synced: "Everything is synced",
  error: "Sync has a problem",
} as const;

const STATE_ICON = {
  offline: <IconCloudOff size={20} />,
  saved_local: <IconDevice size={20} />,
  syncing: <IconSync size={20} />,
  synced: <IconCheck size={20} />,
  error: <IconAlert size={20} />,
} as const;

const timeFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function SyncDetails() {
  const store = useSyncStore();
  const status = useSyncStatus();
  const failed = useFailedOps();
  const online = useOnline();
  return (
    <Card className="syncbox">
      <p className={`syncbox__state syncbox__state--${status.state}`}>
        <span className="syncbox__icon" aria-hidden="true">
          {STATE_ICON[status.state]}
        </span>
        {STATE_LABEL[status.state]}
      </p>
      <StatGrid className="syncbox__facts">
        <Stat label="Waiting to sync" value={status.pending} />
        <Stat label="Turned down" value={failed.length} />
      </StatGrid>
      <p className="muted small">Last synced: {status.lastSyncAt ? timeFmt.format(status.lastSyncAt) : "not yet"}</p>
      {status.lastError && <p className="muted small">Last error: {status.lastError}</p>}
      <div className="syncbox__actions">
        <Button onClick={() => store?.kick()} disabled={!store || !online} icon={<IconSync size={20} />}>
          Sync now
        </Button>
        {(failed.length > 0 || status.lastError) && (
          <Button variant="ghost" onClick={openSyncIssues}>
            See problems
          </Button>
        )}
      </div>
    </Card>
  );
}

function HelpRows() {
  const { replay, openHelp } = useTutorial();
  return (
    <ListGroup label="Help">
      <li>
        <ListRow title="Replay tutorial" meta="A practice workout, start to finish. About two minutes." onClick={replay} chevron />
      </li>
      <li>
        <ListRow title="Screen tips" meta="Tap ? at the top of any screen for tips on that screen." onClick={openHelp} chevron />
      </li>
    </ListGroup>
  );
}

function About() {
  const install = useInstallState();
  const standalone = isStandalone();
  const ios = isIOS();
  const [declined, setDeclined] = useState(false);
  return (
    <div className="stack">
      <p className="muted">Version {pkg.version}. Free: no caps, no ads, no subscription.</p>
      {standalone || install.installed ? (
        <p className="muted small">Installed. It opens from your home screen and works offline.</p>
      ) : install.canPrompt ? (
        <Button
          variant="secondary"
          onClick={() =>
            void promptInstall().then((r) => {
              if (r === "dismissed") setDeclined(true);
            })
          }
        >
          Install app
        </Button>
      ) : ios ? (
        <p className="muted small">
          To install on iPhone or iPad: open this page in Safari, tap the Share button, then Add to Home Screen.
        </p>
      ) : (
        <p className="muted small">
          {declined
            ? "No problem. Your browser's menu has an Install or Add to Home Screen option if you change your mind."
            : "To install, use your browser's Install or Add to Home Screen option. The app works offline either way."}
        </p>
      )}
    </div>
  );
}
