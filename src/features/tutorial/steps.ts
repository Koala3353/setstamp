// Tour copy and the on-screen element each step points at. Targets use selectors the app already
// renders (class names and hrefs), so no feature file needs tour-only attributes.
import type { RouteName } from "../../app/router";
import type { Snapshot, StepId } from "./machine";

export type StepCopy = {
  title: string;
  body: string;
  /** CSS selector(s) for the spotlight target, tried in order; none = centered card. */
  target?: string | string[];
  /** Routes the step lives on. Elsewhere the card is centered and offers `goTo`. */
  routes?: RouteName[];
  /** Where a "go there" button leads when the target isn't on screen. */
  goTo?: { path: string; label: string };
  /** Shown over a bottom sheet the step opens (sheets cover the page, so the card hides). */
  sheetHint?: string;
  /** Where the hint sits: away from the sheet's own title and buttons. */
  sheetHintAt?: "top" | "bottom";
};

export function stepCopy(step: StepId, snap: Snapshot): StepCopy {
  switch (step) {
    case "welcome":
      return {
        title: "A two-minute tour",
        body: "You'll start a practice workout, log one set, then see where your progress shows. Skip it any time.",
      };
    case "start":
      return {
        title: "Start a workout",
        body: "Tap Start. This is a practice workout; you can discard it at the end of the tour.",
        target: ".screen-action .ui-btn--primary",
        routes: ["today"],
        goTo: { path: "/", label: "Go to Today" },
      };
    case "add":
      return snap.exerciseCount > 0
        ? {
            title: "Your exercises",
            body: "Your program day is loaded. To add another, tap Add exercise and search by name or nickname. Try “db bench”.",
            target: ".wk-add .ui-btn",
            routes: ["workout"],
            goTo: { path: "/workout", label: "Open workout" },
            sheetHint: "Type “db bench”, then tap an exercise to add it.",
            sheetHintAt: "bottom",
          }
        : {
            title: "Add an exercise",
            body: "Tap Add exercise and search by name or nickname. Try “db bench”.",
            target: ".wk-add .ui-btn",
            routes: ["workout"],
            goTo: { path: "/workout", label: "Open workout" },
            sheetHint: "Type “db bench”, then tap an exercise to add it.",
            sheetHintAt: "bottom",
          };
    case "log":
      return {
        title: "Log a set",
        body: "Tap the set's numbers to open the steppers. Set weight and reps, then tap Log set. The rest timer starts on its own.",
        target: ".wk-set:not(.is-done)",
        routes: ["workout"],
        goTo: { path: "/workout", label: "Open workout" },
        sheetHint: "Use − and + for weight and reps, then tap Log set.",
      };
    case "edit":
      return {
        title: "Fix a mistake",
        body: "Tap a logged set to change its numbers. Tap its check again to undo it. Deleting a set or an exercise shows Undo for a few seconds.",
        target: ".wk-set.is-done",
        routes: ["workout"],
      };
    case "wrap":
      return {
        title: "Finish or discard",
        body: "Finish workout saves it to your history. This one was practice, so you can discard it and keep your history clean.",
      };
    case "progressTab":
      return {
        title: "See your progress",
        body: "Open the Progress tab.",
        target: '.tabbar a[href="#/progress"]',
        goTo: { path: "/progress", label: "Open Progress" },
      };
    case "bodymap":
      return {
        title: "Muscles this week",
        body: "Under Muscles, tap a muscle to see its sets this week. The count is an estimate: a primary muscle counts 1 set, a secondary one 0.5.",
        // The body map lives on the Muscles tab of Progress; point at the tab until it's open.
        target: [".bm-root", "#progress-tab-muscles"],
        routes: ["progress"],
        goTo: { path: "/progress", label: "Open Progress" },
      };
    case "exercisesTab":
      return {
        title: "Find exercises",
        body: "Open the Exercises tab.",
        target: '.tabbar a[href="#/exercises"]',
        goTo: { path: "/exercises", label: "Open Exercises" },
      };
    case "favorite":
      return {
        title: "Favorite an exercise",
        body: "Tap a star. Favorites are listed first here and when you add exercises to a workout.",
        target: ".exrow__star",
        routes: ["exercises"],
        goTo: { path: "/exercises", label: "Open Exercises" },
      };
    case "done":
      return {
        title: "That's the tour",
        body: "Replay it any time from Settings, under Help. The ? at the top of each screen has short tips for that screen.",
      };
  }
}

/** Short tips per screen for the help sheet. */
export const SCREEN_TIPS: Partial<Record<RouteName, { title: string; tips: string[] }>> = {
  today: {
    title: "Today",
    tips: [
      "Start opens your next program day. Days run in order, so a missed day just waits.",
      "Start empty opens a blank workout. Repeat last copies your last workout.",
      "Recent lists your last three workouts. Tap one to see every set.",
    ],
  },
  workout: {
    title: "Workout",
    tips: [
      "Tap a set's numbers for the steppers, then Log set. The check logs it as shown.",
      "Tap a logged set's check again to undo it.",
      "The rest timer starts when you log a set. Adjust it in the bar at the bottom.",
      "Discard workout deletes the workout and every set in it.",
    ],
  },
  program: {
    title: "Program",
    tips: [
      "Pick a template or build your own days.",
      "Tap a day to change its exercises, sets and rep ranges.",
      "Today always shows the next day in the queue.",
    ],
  },
  exercises: {
    title: "Exercises",
    tips: [
      "Search by name, nickname or muscle. Typos are fine, and it works offline.",
      "Tap the star to favorite an exercise. Favorites are listed first.",
      "Tap an exercise for how to do it and your history with it.",
    ],
  },
  exercise: {
    title: "Exercise",
    tips: [
      "How to do it, the muscles it works, and your history with it once you've logged it.",
      "Estimated 1RM uses the Epley formula on sets of up to 10 reps.",
    ],
  },
  progress: {
    title: "Progress",
    tips: [
      "This week shows estimated sets per muscle on the body map. Tap a muscle for detail.",
      "Records are your best sets per exercise. Tap an exercise for its history.",
      "Tap a finished workout to see every set.",
    ],
  },
  settings: {
    title: "Settings",
    tips: ["Units change how weights are shown. Logged sets keep the unit you typed.", "Your data exports everything as JSON, or your sets as CSV."],
  },
};
