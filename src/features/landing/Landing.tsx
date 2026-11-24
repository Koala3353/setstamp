// Marketing page for signed-out visitors in a browser tab (Persuade mode). Lazy-loaded from
// App.tsx so the installed app never downloads it. Every claim here is true of the product today;
// numbers in the phone are sample data and say so. No testimonials, counts or ratings.
import type { ReactNode } from "react";
import {
  IconCheck,
  IconCloudOff,
  IconDownload,
  IconMinus,
  IconPlus,
  IconProgram,
  IconProgress,
  IconRecord,
  IconSearch,
  IconTimer,
  IconToday,
  IconDumbbell,
  Wordmark,
} from "../../ui";
import { AUTH_PATHS } from "./entry";
import "./landing.css";

const SIGN_UP = "#" + AUTH_PATHS.signUp;
const SIGN_IN = "#" + AUTH_PATHS.signIn;

function CtaPrimary({ children }: { children: ReactNode }) {
  return (
    <a className="ui-btn ui-btn--primary ui-btn--lg lp-cta" href={SIGN_UP}>
      <span className="ui-btn__label">{children}</span>
    </a>
  );
}

function CtaSecondary({ children }: { children: ReactNode }) {
  return (
    <a className="ui-btn ui-btn--secondary ui-btn--lg lp-cta" href={SIGN_IN}>
      <span className="ui-btn__label">{children}</span>
    </a>
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
          <a className="ui-btn ui-btn--ghost ui-btn--md" href={SIGN_IN}>
            <span className="ui-btn__label">Sign in</span>
          </a>
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
                Log weight and reps with one hand between sets. It works without signal, keeps your full history, and
                has no subscription.
              </p>
              <div className="lp-actions">
                <CtaPrimary>Create free account</CtaPrimary>
                <CtaSecondary>Sign in</CtaSecondary>
              </div>
              <p className="lp-hero__fine">Free, with no limits on history, programs or exercises. You can export or delete your data any time.</p>
            </div>
            <div className="lp-hero__visual">
              <Phone />
              <p className="lp-caption">Sample session: the logging screen at actual phone size.</p>
            </div>
          </div>
        </section>

        <section className="lp-band lp-plate" aria-labelledby="lp-how">
          <div className="lp-wrap">
            <h2 id="lp-how" className="lp-h2 display">
              How it works
            </h2>
            <ol className="lp-steps">
              <li>
                <span className="lp-steps__n num" aria-hidden="true">1</span>
                <div>
                  <h3>Open</h3>
                  <p>Today shows the next day of your program. If you miss a session, it stays next in line instead of moving to a different weekday.</p>
                </div>
              </li>
              <li>
                <span className="lp-steps__n num" aria-hidden="true">2</span>
                <div>
                  <h3>Log</h3>
                  <p>Weight and reps are prefilled from last time. Adjust with the big keys, tap Log set, and the rest timer starts.</p>
                </div>
              </li>
              <li>
                <span className="lp-steps__n num" aria-hidden="true">3</span>
                <div>
                  <h3>See progress</h3>
                  <p>Check personal records, estimated 1RM and weekly sets per muscle. Estimates are labelled as estimates.</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="lp-band lp-orange" aria-labelledby="lp-free">
          <div className="lp-wrap lp-free">
            <h2 id="lp-free" className="lp-free__title display">
              Everything is free
            </h2>
            <div className="lp-free__body">
              <p>
                Many trackers let you log for free and charge for extra routines, older history or progress charts.
              </p>
              <p>
                Setstamp has no paid tier. There are no limits on routines or history, and every feature is available
                from the start.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-band lp-steel" aria-labelledby="lp-what">
          <div className="lp-wrap">
            <h2 id="lp-what" className="lp-h2 display">
              What's included
            </h2>
            <dl className="lp-spec">
              <Spec icon={<IconCloudOff />} term="Works offline">
                Sets save to your phone first and sync when you're back online, so logging works with no signal.
              </Spec>
              <Spec icon={<IconDumbbell />} term="One-handed logging">
                Large numbers you can read at arm's length, big plus and minus buttons, and the main button near the bottom of the screen.
              </Spec>
              <Spec icon={<IconSearch />} term="1,383 exercises">
                Search runs on your phone, so results are instant, and it handles typos and common nicknames. You can add your own exercises.
              </Spec>
              <Spec icon={<IconProgram />} term="Programs">
                Upper/lower, push/pull/legs and full-body templates, or build your own day by day.
              </Spec>
              <Spec icon={<IconProgress />} term="Body-map coverage">
                See which muscles you trained this week as estimated sets per muscle. It's an estimate, not a diagnosis.
              </Spec>
              <Spec icon={<IconDownload />} term="Your data">
                Export everything as JSON or CSV. Delete your account and your data goes with it.
              </Spec>
            </dl>

            <figure className="lp-record">
              <figcaption className="lp-record__cap">Sample progress</figcaption>
              <div className="lp-record__row">
                <span className="lp-record__icon">
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
                  <p className="lp-record__what">est. 1RM (Epley)</p>
                </div>
              </div>
            </figure>
          </div>
        </section>

        <section className="lp-band lp-plate" aria-labelledby="lp-install">
          <div className="lp-wrap lp-final">
            <h2 id="lp-install" className="lp-h2 display">
              Install it on your phone
            </h2>
            <p className="lp-final__lede">
              Create an account here, then add Setstamp to your home screen from your browser. No app store needed. It opens
              full screen from its own icon and works without signal. On iPhone you'll sign in once more inside the home-screen app.
            </p>
            <div className="lp-actions">
              <CtaPrimary>Create free account</CtaPrimary>
              <CtaSecondary>Sign in</CtaSecondary>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot lp-steel">
        <div className="lp-wrap lp-foot__inner">
          <span className="lp-foot__mark"><Wordmark height={28} /></span>
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

/** The logging screen, built from the app's own markup classes. Decorative: hidden from AT, inert. */
function Phone() {
  return (
    <div className="lp-phone" aria-hidden="true" inert>
      <div className="lp-phone__screen">
        <div className="lp-phone__head">
          <p className="lp-phone__title display">Upper A</p>
          <span className="lp-phone__timer num">
            <IconTimer size={16} /> 1:42
          </span>
        </div>

        <div className="lp-phone__ex">
          <p className="lp-phone__exname">Bench press</p>
          <p className="lp-phone__prev">Last time 80 kg × 8, 8, 7</p>
        </div>

        <ol className="lp-sets">
          <li className="lp-set lp-set--done">
            <span className="lp-set__n num">1</span>
            <span className="lp-set__fig num">
              80<small>kg</small> × 8
            </span>
            <span className="lp-set__check">
              <IconCheck size={18} />
            </span>
          </li>
          <li className="lp-set lp-set--done">
            <span className="lp-set__n num">2</span>
            <span className="lp-set__fig num">
              82.5<small>kg</small> × 8
            </span>
            <span className="lp-set__check">
              <IconCheck size={18} />
            </span>
          </li>
          <li className="lp-set lp-set--active">
            <span className="lp-set__n num">3</span>
            <span className="lp-set__label">Now</span>
          </li>
        </ol>

        <div className="lp-steppers">
          <div className="lp-stepper">
            <span className="lp-stepper__key">
              <IconMinus size={20} />
            </span>
            <span className="lp-stepper__val num">
              82.5<small>kg</small>
            </span>
            <span className="lp-stepper__key">
              <IconPlus size={20} />
            </span>
          </div>
          <div className="lp-stepper">
            <span className="lp-stepper__key">
              <IconMinus size={20} />
            </span>
            <span className="lp-stepper__val num">
              8<small>reps</small>
            </span>
            <span className="lp-stepper__key">
              <IconPlus size={20} />
            </span>
          </div>
        </div>

        <span className="ui-btn ui-btn--primary ui-btn--lg ui-btn--block lp-phone__log">
          <span className="ui-btn__label">Log set</span>
        </span>

        <nav className="lp-tabs">
          <span className="lp-tabs__tab lp-tabs__tab--on">
            <IconToday size={22} />
          </span>
          <span className="lp-tabs__tab">
            <IconProgram size={22} />
          </span>
          <span className="lp-tabs__tab">
            <IconSearch size={22} />
          </span>
          <span className="lp-tabs__tab">
            <IconProgress size={22} />
          </span>
        </nav>
      </div>
    </div>
  );
}
