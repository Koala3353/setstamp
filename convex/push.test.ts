import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { setup, signInAs, type T } from "./test.setup";

const sub = (n: string) => ({ endpoint: `https://push.example.com/send/${n}`, keys: { p256dh: `p256-${n}`, auth: `auth-${n}` } });

const subsOf = (t: T, userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );

const jobState = (t: T, id: Id<"_scheduled_functions">) => t.run(async (ctx) => (await ctx.db.system.get(id))?.state.kind);

const alertsOf = (t: T, userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("restAlerts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );

describe("push", () => {
  test("every mutation requires sign-in", async () => {
    const t = setup();
    await expect(t.mutation(api.push.saveSubscription, sub("a"))).rejects.toThrow(/Not signed in/);
    await expect(t.mutation(api.push.removeSubscription, { endpoint: sub("a").endpoint })).rejects.toThrow(/Not signed in/);
    await expect(t.mutation(api.push.scheduleRestAlert, { endsAt: Date.now() + 60_000, label: "Squat" })).rejects.toThrow(
      /Not signed in/,
    );
    await expect(t.mutation(api.push.cancelRestAlert, {})).rejects.toThrow(/Not signed in/);
    expect(await t.query(api.push.isSubscribed, { endpoint: sub("a").endpoint })).toBe(false);
  });

  test("save validates, is idempotent, and remove only touches the caller's rows", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    await expect(a.as.mutation(api.push.saveSubscription, { ...sub("x"), endpoint: "http://insecure.example.com/x" })).rejects.toThrow(
      /https/,
    );
    await a.as.mutation(api.push.saveSubscription, sub("a"));
    await a.as.mutation(api.push.saveSubscription, sub("a"));
    await b.as.mutation(api.push.saveSubscription, sub("b"));
    expect(await subsOf(t, a.userId)).toHaveLength(1);
    expect(await a.as.query(api.push.isSubscribed, { endpoint: sub("a").endpoint })).toBe(true);
    expect(await b.as.query(api.push.isSubscribed, { endpoint: sub("a").endpoint })).toBe(false);

    // B can't remove A's subscription by knowing its endpoint.
    await b.as.mutation(api.push.removeSubscription, { endpoint: sub("a").endpoint });
    expect(await subsOf(t, a.userId)).toHaveLength(1);
    await a.as.mutation(api.push.removeSubscription, { endpoint: sub("a").endpoint });
    expect(await subsOf(t, a.userId)).toHaveLength(0);
    expect(await subsOf(t, b.userId)).toHaveLength(1);
  });

  test("a browser that switches accounts moves to the new account", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    await a.as.mutation(api.push.saveSubscription, sub("shared"));
    await b.as.mutation(api.push.saveSubscription, sub("shared"));
    expect(await subsOf(t, a.userId)).toHaveLength(0);
    expect(await subsOf(t, b.userId)).toHaveLength(1);
  });

  test("schedule needs a subscription; rescheduling cancels the previous alert; cancel clears it", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    const b = await signInAs(t, "B");
    const soon = () => Date.now() + 90_000;
    expect(await a.as.mutation(api.push.scheduleRestAlert, { endsAt: soon(), label: "Squat" })).toBe(false);
    expect(await alertsOf(t, a.userId)).toHaveLength(0);

    await a.as.mutation(api.push.saveSubscription, sub("a"));
    await b.as.mutation(api.push.saveSubscription, sub("b"));
    expect(await a.as.mutation(api.push.scheduleRestAlert, { endsAt: soon(), label: "Squat" })).toBe(true);
    const [first] = await alertsOf(t, a.userId);
    expect(await jobState(t, first.scheduledId)).toBe("pending");

    expect(await a.as.mutation(api.push.scheduleRestAlert, { endsAt: soon() + 15_000, label: "Squat" })).toBe(true);
    const after = await alertsOf(t, a.userId);
    expect(after).toHaveLength(1);
    expect(after[0].scheduledId).not.toBe(first.scheduledId);
    expect(await jobState(t, first.scheduledId)).toBe("canceled");
    expect(await jobState(t, after[0].scheduledId)).toBe("pending");

    // B scheduling or cancelling never touches A's alert.
    await b.as.mutation(api.push.scheduleRestAlert, { endsAt: soon(), label: "Bench" });
    await b.as.mutation(api.push.cancelRestAlert, {});
    expect(await jobState(t, after[0].scheduledId)).toBe("pending");

    await a.as.mutation(api.push.cancelRestAlert, {});
    expect(await alertsOf(t, a.userId)).toHaveLength(0);
    expect(await jobState(t, after[0].scheduledId)).toBe("canceled");
  });

  test("schedule rejects out-of-range times and can target one browser", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    await a.as.mutation(api.push.saveSubscription, sub("phone"));
    await expect(a.as.mutation(api.push.scheduleRestAlert, { endsAt: Date.now() + 3 * 3_600_000, label: "x" })).rejects.toThrow(
      /out of range/,
    );
    expect(
      await a.as.mutation(api.push.scheduleRestAlert, { endsAt: Date.now() + 60_000, label: "x", endpoint: sub("laptop").endpoint }),
    ).toBe(false);
    expect(
      await a.as.mutation(api.push.scheduleRestAlert, { endsAt: Date.now() + 60_000, label: "x", endpoint: sub("phone").endpoint }),
    ).toBe(true);
  });

  test("deleting data or the account removes subscriptions and cancels the pending alert", async () => {
    const t = setup();
    const a = await signInAs(t, "A");
    await a.as.mutation(api.push.saveSubscription, sub("a"));
    await a.as.mutation(api.push.scheduleRestAlert, { endsAt: Date.now() + 60_000, label: "Squat" });
    const [alert] = await alertsOf(t, a.userId);
    await a.as.mutation(api.account.deleteAllData, {});
    expect(await subsOf(t, a.userId)).toHaveLength(0);
    expect(await alertsOf(t, a.userId)).toHaveLength(0);
    expect(await jobState(t, alert.scheduledId)).toBe("canceled");

    await a.as.mutation(api.push.saveSubscription, sub("a"));
    await a.as.mutation(api.push.scheduleRestAlert, { endsAt: Date.now() + 60_000, label: "Squat" });
    const [again] = await alertsOf(t, a.userId);
    await a.as.mutation(api.account.deleteAccount, {});
    expect(await subsOf(t, a.userId)).toHaveLength(0);
    expect(await jobState(t, again.scheduledId)).toBe("canceled");
  });
});
