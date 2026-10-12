/** Canonical Motif spring: perceptual duration (seconds) + bounce, the model SwiftUI and Motion use natively. */
export interface SpringParams {
  duration: number;
  bounce: number;
}

export interface SpringPhysics {
  mass: 1;
  stiffness: number;
  damping: number;
  dampingRatio: number;
}

export function springPhysics({ duration, bounce }: SpringParams): SpringPhysics {
  if (!(duration > 0)) throw new RangeError("spring duration must be greater than 0");
  if (!(bounce > -1 && bounce < 1)) throw new RangeError("spring bounce must be greater than -1 and less than 1");
  const stiffness = (2 * Math.PI / duration) ** 2;
  const damping = bounce >= 0
    ? (4 * Math.PI * (1 - bounce)) / duration
    : (4 * Math.PI) / (duration * (1 + bounce));
  return { mass: 1, stiffness, damping, dampingRatio: damping / (2 * Math.sqrt(stiffness)) };
}

export function toMotionTransition(p: SpringParams): { type: "spring"; visualDuration: number; bounce: number } {
  return { type: "spring", visualDuration: p.duration, bounce: p.bounce };
}
