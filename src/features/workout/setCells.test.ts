import { describe, expect, it } from "vitest";
import type { SetData } from "../../shared/sync";
import { setCells, spokenSet } from "./setCells";

const s = (p: Partial<SetData>) => ({ weightKg: null, entered: null, reps: null, assistKg: null, durationSec: null, distanceM: null, ...p });

describe("set row cells", () => {
  it("weight and time / weight and distance show two stamped values", () => {
    const hold = setCells(s({ weightKg: 20, entered: { value: 20, unit: "kg" }, durationSec: 45 }), "weight_duration", "kg");
    expect(hold.map((c) => `${c.main} ${c.sub}`)).toEqual(["20 kg", "45 s"]);
    expect(spokenSet(hold)).toBe("20 kg, 45 seconds");
    const carry = setCells(s({ weightKg: 40, entered: { value: 40, unit: "kg" }, distanceM: 30 }), "weight_distance", "kg");
    expect(spokenSet(carry)).toBe("40 kg, 30 metres");
    expect(spokenSet(setCells(s({ weightKg: 40, entered: { value: 40, unit: "kg" } }), "weight_distance", "kg"))).toBe("40 kg, no distance yet");
  });
  it("keeps the existing types as they were", () => {
    expect(spokenSet(setCells(s({ weightKg: 100, entered: { value: 100, unit: "kg" }, reps: 8 }), "weight_reps", "kg"))).toBe("100 kg, 8 reps");
    expect(spokenSet(setCells(s({ reps: 12 }), "bodyweight_reps", "kg"))).toBe("bodyweight, 12 reps");
    expect(spokenSet(setCells(s({ durationSec: 60 }), "duration", "kg"))).toBe("60 seconds");
    expect(setCells(s({ durationSec: 60 }), "distance_time", "kg")).toHaveLength(1);
    expect(setCells(s({ durationSec: 60, distanceM: 400 }), "distance_time", "kg")).toHaveLength(2);
  });
});
