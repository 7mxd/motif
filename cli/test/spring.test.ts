import { describe, expect, test } from "bun:test";
import { springPhysics, toMotionTransition } from "../src/contract/spring";

describe("springPhysics", () => {
  test("critically damped: 0.5 s, bounce 0 (matches SwiftUI Spring(duration: 0.5, bounce: 0))", () => {
    const s = springPhysics({ duration: 0.5, bounce: 0 });
    expect(s.mass).toBe(1);
    expect(s.stiffness).toBeCloseTo(157.9137, 3);
    expect(s.damping).toBeCloseTo(25.1327, 3);
    expect(s.dampingRatio).toBeCloseTo(1, 10);
  });

  test("bouncy: damping ratio is 1 − bounce", () => {
    const s = springPhysics({ duration: 0.5, bounce: 0.3 });
    expect(s.damping).toBeCloseTo(17.5929, 3);
    expect(s.dampingRatio).toBeCloseTo(0.7, 10);
  });

  test("negative bounce is overdamped: ratio is 1 / (1 + bounce)", () => {
    const s = springPhysics({ duration: 1, bounce: -0.5 });
    expect(s.stiffness).toBeCloseTo(39.4784, 3);
    expect(s.damping).toBeCloseTo(25.1327, 3);
    expect(s.dampingRatio).toBeCloseTo(2, 10);
  });

  test("rejects impossible values", () => {
    expect(() => springPhysics({ duration: 0, bounce: 0 })).toThrow(RangeError);
    expect(() => springPhysics({ duration: 0.3, bounce: 1 })).toThrow(RangeError);
    expect(() => springPhysics({ duration: 0.3, bounce: -1 })).toThrow(RangeError);
  });
});

describe("toMotionTransition", () => {
  test("passes duration and bounce straight through", () => {
    expect(toMotionTransition({ duration: 0.4, bounce: 0.1 })).toEqual({ type: "spring", visualDuration: 0.4, bounce: 0.1 });
  });
});
