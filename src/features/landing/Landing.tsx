// Marketing page for signed-out visitors in a browser tab (Persuade mode). Lazy-loaded from
// App.tsx so the installed app never downloads it. Every claim here is true of the product today
// and the competitor facts come from docs/research/competitors.md. Numbers shown in the product
// renders are sample data and say so. No testimonials, counts or ratings.
import type { ReactNode } from "react";
import { BodyMap, BodyMapLegend, type MuscleLevels } from "../../bodymap";
import {
  IconCheck,
  IconCloudOff,
  IconDownload,
  IconDumbbell,
  IconProgram,
  IconRecord,
  IconSearch,
  IconTimer,
  Stat,
  StatGrid,
  SyncStatus,
  Wordmark,
} from "../../ui";
import { AUTH_PATHS } from "./entry";
import "./landing.css";

const SIGN_UP = "#" + AUTH_PATHS.signUp;
const SIGN_IN = "#" + AUTH_PATHS.signIn;

function Ctas() {
  return (
    <div className="lp-actions">
      <a className="ui-btn ui-btn--primary ui-btn--lg lp-cta" href={SIGN_UP}>
        <span className="ui-btn__label">Create free account</span>
      </a>
      <a className="ui-btn ui-btn--secondary ui-btn--lg lp-cta" href={SIGN_IN}>
        <span className="ui-btn__label">Sign in</span>
      </a>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-bar lp-steel">
        <div className="lp-wrap lp-bar__inner">
          <span className="lp-bar__mark">
            <Wordmark height={22} />
          </span>
          <nav className="lp-bar__nav" aria-label="Account">
            <a className="ui-btn ui-btn--ghost ui-btn--md" href={SIGN_IN}>
              <span className="ui-btn__label">Sign in</span>
            </a>
            <a className="ui-btn ui-btn--primary ui-btn--md lp-bar__join" href={SIGN_UP}>
              <span className="ui-btn__label">Create free account</span>
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-hero lp-steel" aria-labelledby="lp-title">
          <div className="lp-wrap lp-hero__grid">
            <div className="lp-hero__copy">
              <h1 id="lp-title" className="lp-hero__title display">
                A free lifting log that works offline
              </h1>
              <p className="lp-hero__lede">
                Setstamp has no paid plan. Unlimited programs, charts over your whole history and every other feature
                come with a free account. Sets save to your phone first, so logging works with no signal, and a set that
                repeats the last one takes one tap.
              </p>
              <Ctas />
              <p className="lp-hero__fine">No ads and nothing to upgrade to. Export or delete your data any time.</p>
            </div>
            <figure className="lp-hero__visual">
              <Phone />
              <figcaption className="lp-caption">
                Sample session, at phone size. Set 3 is filled in from set 2, so logging it is one tap on the check, and
                the rest timer starts.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="lp-band lp-plate" aria-labelledby="lp-why">
          <div className="lp-wrap">
            <h2 id="lp-why" className="lp-h2 display">
              Why use it
            </h2>
            <div className="lp-why">
              <div className="lp-why__item">
                <h3>Nothing is locked</h3>
                <p>
                  Many tracker apps log for free and charge for more routines, older charts or small tools like a plate
                  calculator. Setstamp has no paid plan, so none of that is held back.
                </p>
              </div>
              <div className="lp-why__item">
                <h3>Works with no signal</h3>
                <p>
                  Every set is written to your phone before it goes anywhere. With no signal the app keeps working and
                  shows how many changes are waiting. They sync when you're back online.
                </p>
              </div>
              <div className="lp-why__item">
                <h3>Quick between sets</h3>
                <p>
                  Each set is filled in from the one above or from last session. If the numbers are right, tap the check.
                  The numbers are large and the buttons sit low on the screen, so one hand is enough.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band lp-orange" aria-labelledby="lp-compare">
          <div className="lp-wrap">
            <h2 id="lp-compare" className="lp-h2 lp-compare__title display">
              Compared with Strong and Hevy
            </h2>
            <p className="lp-compare__intro">
              Both are well-made apps, and both let you log workouts for free. Their free plans cap a few things that
              Setstamp doesn't.
            </p>
            <div className="lp-table" role="region" aria-labelledby="lp-compare" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="sr-only">Feature</span>
                    </th>
                    <th scope="col" className="lp-table__us">
                      Setstamp
                    </th>
                    <th scope="col">
                      Strong <span className="lp-table__sub">free plan</span>
                    </th>
                    <th scope="col">
                      Hevy <span className="lp-table__sub">free plan</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <Row label="Saved routines" us="Unlimited" strong="3 templates" hevy="4 routines" />
                  <Row label="Custom exercises" us="Unlimited" strong="No limit reported" hevy="7" />
                  <Row label="Progress chart history" us="All of it" strong="Some charts need Pro" hevy="About 3 months" />
                  <Row label="Plate calculator" us="Included" strong="Pro" hevy="Included" />
                  <Row label="Warm-up sets" us="Included" strong="Pro" hevy="Pro" />
                  <Row label="Paid plan" us="None" strong="$23.99–29.99 a year" hevy="$23.99 a year" />
                  <Row label="App store app and Apple Watch" us="No, it's a web app" strong="Yes" hevy="Yes" />
                </tbody>
              </table>
            </div>
            <p className="lp-compare__note">
              Strong and Hevy limits and US prices as reported at the time of writing (November 2026) by reviews that
              cite each app's own documentation:{" "}
              <a href="https://aitoolsbakery.com/blog/strong-app-review/" target="_blank" rel="noopener noreferrer">
                Strong
              </a>
              ,{" "}
              <a href="https://aitoolsbakery.com/blog/hevy-review/" target="_blank" rel="noopener noreferrer">
                Hevy
              </a>
              . Plans change, so check their sites for current terms.
            </p>
          </div>
        </section>

        <section className="lp-band lp-plate" aria-labelledby="lp-see">
          <div className="lp-wrap">
            <h2 id="lp-see" className="lp-h2 display">
              Progress you can check
            </h2>
            <p className="lp-section-lede">
              The Stats tab and the muscle map read from every set you've logged. Estimates are labelled as estimates.
            </p>
            <div className="lp-screens">
              <figure className="lp-screen">
                <div className="lp-screen__frame">
                  <p className="lp-screen__title">Muscles, this week</p>
                  <div className="lp-screen__map" inert>
                    <BodyMap levels={SAMPLE_WEEK} mode="volume" compact valueContext="this week" />
                  </div>
                  <BodyMapLegend mode="volume" />
                </div>
                <figcaption className="lp-caption">
                  Sample week. Tap a muscle in the app to see its last 10 weeks. The map shows what you logged, not
                  recovery or soreness.
                </figcaption>
              </figure>

              <figure className="lp-screen">
                <div className="lp-screen__frame">
                  <p className="lp-screen__title">Stats, last 12 weeks</p>
                  <StatGrid>
                    <Stat label="Workouts" value="26" />
                    <Stat label="Working sets" value="273" note="Warm-ups not counted" />
                    <Stat label="Volume" value="118,246" unit="kg" note="Weight × reps" />
                    <Stat label="Time trained" value="28.3" unit="h" />
                  </StatGrid>
                  <Calendar />
                  <div className="lp-record">
                    <span className="lp-record__icon" aria-hidden="true">
                      <IconRecord />
                    </span>
                    <div>
                      <p className="lp-record__what">Bench press, new best</p>
                      <p className="lp-record__fig num">
                        85 <span>kg</span> × 5
                      </p>
                    </div>
                    <div className="lp-record__est">
                      <p className="lp-record__fig lp-record__fig--sm num">
                        99 <span>kg</span>
                      </p>
                      <p className="lp-record__what">est. 1RM</p>
                    </div>
                  </div>
                </div>
                <figcaption className="lp-caption">
                  Sample data. Switch between 4 weeks, 12 weeks, 1 year and all time. Records, volume and the training
                  calendar cover your full history.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="lp-band lp-steel" aria-labelledby="lp-what">
          <div className="lp-wrap">
            <h2 id="lp-what" className="lp-h2 display">
              What's in the free account
            </h2>
            <dl className="lp-spec">
              <Spec icon={<IconProgram />} term="Programs">
                Upper/lower, push/pull/legs (3 or 6 days) and full-body templates, or build your own days. If you miss a
                session, that day stays next in line.
              </Spec>
              <Spec icon={<IconDumbbell />} term="Supersets, timed and distance sets">
                Pair exercises into a superset. Log weight and reps, weight and time for holds, or weight and distance for
                carries and sled pushes. Bodyweight and assisted exercises work too.
              </Spec>
              <Spec icon={<IconSearch />} term="1,383 exercises">
                Search runs on your phone, so results are instant, and it handles typos and common nicknames. You can add
                your own exercises.
              </Spec>
              <Spec icon={<IconTimer />} term="Plates, warm-ups and rest">
                See which plates go on each side of the bar, add warm-up sets worked out from your working weight, and use
                the rest timer. Progression hints show the rule they used.
              </Spec>
              <Spec icon={<IconCloudOff />} term="Sync status you can see">
                The header says whether your sets are synced, saved on the phone or waiting, and how many. If a sync fails
                you can retry it.
              </Spec>
              <Spec icon={<IconDownload />} term="Your data">
                Export everything as JSON or your sets as CSV. Delete your training data or your whole account from
                Settings.
              </Spec>
            </dl>
            <p className="lp-spec__more">
              Kilograms or pounds, light and dark themes, and a short tour the first time you open the app.
            </p>
            <Ctas />
          </div>
        </section>

        <section className="lp-band lp-plate" aria-labelledby="lp-install">
          <div className="lp-wrap">
            <h2 id="lp-install" className="lp-h2 display">
              Install it on your phone
            </h2>
            <p className="lp-section-lede">
              Setstamp is a web app, so there's nothing to download from an app store. Create an account in your browser,
              then add it to your home screen. It opens full screen from its own icon.
            </p>
            <div className="lp-install">
              <div className="lp-install__col">
                <h3>iPhone, in Safari</h3>
                <ol>
                  <li>Open this page in Safari.</li>
                  <li>Tap Share in the toolbar.</li>
                  <li>Tap Add to Home Screen, then Add.</li>
                  <li>Open Setstamp from the new icon and sign in once more. The home-screen app keeps its own storage.</li>
                </ol>
              </div>
              <div className="lp-install__col">
                <h3>Android, in Chrome</h3>
                <ol>
                  <li>Open this page in Chrome.</li>
                  <li>Tap the menu button (three dots).</li>
                  <li>Choose Install app or Add to Home screen.</li>
                  <li>Open Setstamp from the new icon.</li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-band lp-steel" aria-labelledby="lp-faq">
          <div className="lp-wrap lp-faq">
            <h2 id="lp-faq" className="lp-h2 display">
              Questions
            </h2>
            <div className="lp-faq__list">
              <Faq q="Is it really free?">
                Yes. There's no paid plan, no trial and no ads, and every feature on this page comes with a free account.
                It runs on free hosting plans.
              </Faq>
              <Faq q="Do I need an account?">
                Yes. Sign up with an email and password, or with Google. The account is what syncs your log between
                devices and keeps it if you lose your phone.
              </Faq>
              <Faq q="What happens to my data?">
                Your log is stored on your phone and in the database that syncs it between your devices. There's no
                analytics, and your data isn't sold or shared for marketing. From Settings you can export it as JSON or
                CSV, delete your training data, or delete your account and its data. Details are on the{" "}
                <a href={`${import.meta.env.BASE_URL}privacy.html`}>privacy page</a>.
              </Faq>
              <Faq q="Does it work offline?">
                Yes, once you've signed in on that phone. The app and the exercise list are stored on the device and every
                set saves there first. When you're back online your changes sync. Signing in for the first time needs a
                connection.
              </Faq>
              <Faq q="Does it work on iPhone and Android?">
                Both. Install it from Safari on iPhone or Chrome on Android, or use it in a desktop browser. There's no
                App Store or Play Store listing and no watch app.
              </Faq>
              <Faq q="Can I import my history from Strong or Hevy?">
                No. There's no import, so your past workouts stay in the app you used before. Export them from that app if
                you want to keep a copy, and start logging here from your next session.
              </Faq>
              <Faq q="Kilograms or pounds?">
                Either. Weights are stored as you enter them, so 45 lb plates stay 45 lb and don't drift through
                conversion.
              </Faq>
            </div>
          </div>
        </section>

        <section className="lp-band lp-plate" aria-labelledby="lp-start">
          <div className="lp-wrap lp-final">
            <h2 id="lp-start" className="lp-h2 display">
              Try it at your next session
            </h2>
            <p className="lp-section-lede">
              Creating an account takes an email and a password, or a Google sign-in. Pick a program template, or start an
              empty workout and add exercises as you go.
            </p>
            <Ctas />
          </div>
        </section>
      </main>

      <footer className="lp-foot lp-steel">
        <div className="lp-wrap lp-foot__inner">
          <span className="lp-foot__mark">
            <Wordmark height={28} />
          </span>
          <div className="lp-foot__credits">
            <p>
              Exercise data by{" "}
              <a href="https://repdb.co" target="_blank" rel="noopener noreferrer">
                RepDB (repdb.co)
              </a>
              .
            </p>
            <p>
              Base catalog from{" "}
              <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener noreferrer">
                free-exercise-db
              </a>
              , released under the Unlicense.
            </p>
            <p>
              <a href={`${import.meta.env.BASE_URL}privacy.html`}>Privacy</a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Row({ label, us, strong, hevy }: { label: string; us: string; strong: string; hevy: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td className="lp-table__us">{us}</td>
      <td>{strong}</td>
      <td>{hevy}</td>
    </tr>
  );
}

function Spec({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="lp-spec__item">
      <dt>
        <span className="lp-spec__icon" aria-hidden="true">
          {icon}
        </span>
        {term}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="lp-faq__item">
      <summary>{q}</summary>
      <p>{children}</p>
    </details>
  );
}

/** Sample estimated weekly sets for the muscle map (an upper/lower week). */
const SAMPLE_WEEK: MuscleLevels = {
  chest: 9,
  front_delts: 7.5,
  side_delts: 6,
  rear_delts: 3,
  triceps: 6.5,
  biceps: 5,
  lats: 10,
  upper_back: 9.5,
  traps: 3.5,
  quads: 11,
  glutes: 8,
  hamstrings: 6,
  adductors: 2.5,
  calves: 4,
  abs: 3,
  forearms: 2,
  lower_back: 2,
};

/** Training days over 12 weeks, sample data: weeks are columns, Monday on top. */
const CAL_DAYS = [
  "1000100", "0101000", "1001010", "0100100", "1010000", "0001001",
  "1000100", "0101010", "1001000", "0100100", "1010010", "0100000",
];

function Calendar() {
  return (
    <div className="lp-cal" aria-hidden="true">
      <p className="lp-cal__label">Training days</p>
      <div className="lp-cal__grid">
        {CAL_DAYS.map((week, w) =>
          [...week].map((d, i) => <span key={`${w}-${i}`} className={d === "1" ? "is-on" : undefined} style={{ gridColumn: w + 1, gridRow: i + 1 }} />),
        )}
      </div>
    </div>
  );
}

/**
 * The logging screen, drawn with the app's own components (SyncStatus) and its set-row layout.
 * Decorative: hidden from assistive tech and inert. Set 3 is logged on load (one authored moment).
 */
function Phone() {
  return (
    <div className="lp-phone" aria-hidden="true" inert>
      <div className="lp-phone__screen">
        <div className="lp-phone__head">
          <p className="lp-phone__title display">Upper A</p>
          <SyncStatus status={{ state: "offline", pending: 3 }} className="lp-phone__sync" />
        </div>

        <div className="lp-ex">
          <p className="lp-ex__name">Bench press</p>
          <p className="lp-ex__meta">Target 3 × 6–10 · Last time 80 kg × 8, 8, 7</p>
          <ol className="lp-sets">
            <SetRow n={1} kg="80" reps={8} done />
            <SetRow n={2} kg="82.5" reps={8} done />
            <SetRow n={3} kg="82.5" reps={8} live />
          </ol>
        </div>

        <div className="lp-ex lp-ex--next">
          <p className="lp-ex__name">Chest-supported row</p>
          <p className="lp-ex__meta">Target 3 × 8–12 · Last time 30 kg × 12, 11, 10</p>
          <ol className="lp-sets">
            <SetRow n={1} kg="30" reps={12} />
          </ol>
        </div>

        <div className="lp-rest">
          <IconTimer size={20} />
          <span className="lp-rest__time num">2:30</span>
          <span className="lp-rest__btn">−15</span>
          <span className="lp-rest__btn">+15</span>
          <span className="lp-rest__btn lp-rest__btn--skip">Skip</span>
        </div>
      </div>
    </div>
  );
}

function SetRow({ n, kg, reps, done, live }: { n: number; kg: string; reps: number; done?: boolean; live?: boolean }) {
  const cls = ["lp-set", done && "is-done", live && "is-live"].filter(Boolean).join(" ");
  return (
    <li className={cls}>
      <span className="lp-set__badge num">{n}</span>
      <span className="lp-set__values">
        <span className="num">{kg}</span>
        <small>kg</small>
        <span className="lp-set__x">×</span>
        <span className="num">{reps}</span>
        <small>reps</small>
      </span>
      <span className="lp-set__check">
        <IconCheck size={22} />
        {live && (
          <span className="lp-set__stamp">
            <IconCheck size={22} />
          </span>
        )}
      </span>
    </li>
  );
}
