# Motion

Motion explains change. It gives feedback (your press registered), orientation (this sheet came from that button) and continuity (the thumbnail you tapped became this photo). It is never decoration: if an animation explains nothing, remove it. Every duration, curve and spring comes from the guide's motion roles in `design/tokens.json`, and the generated theme code turns them into each platform's own animation values.

## Durations and easing

Pick the duration role by the job, not by feel:

| Role | Roughly | For |
|---|---|---|
| `duration.instant` | 0 ms | Changes that must feel immediate: selection, toggled text, a checked box's state |
| `duration.fast` | 100–150 ms | Hovers, presses, small fades, icon swaps |
| `duration.base` | 200–250 ms | Menus, toasts, tooltips, most transitions |
| `duration.slow` | 300–400 ms | Large surfaces: sheets, dialogs, page transitions |

**Bigger distance or bigger surface means longer.** A tooltip travelling 4 px needs less time than a sheet covering half the screen. Never go past `duration.slow` for routine UI; anything longer feels like waiting.

**Exits are quicker than entrances**: use the next shorter duration role for the exit (`duration.fast` for something that entered with `duration.base`). People have already decided to dismiss it; let it leave promptly.

**Easing by direction:**

- `easing.standard` for something moving between two resting states (a tab indicator sliding, a card expanding).
- `easing.enter` (decelerating) for things arriving: fast at first, settling gently.
- `easing.exit` (accelerating) for things leaving: gentle start, quick finish.

## Springs

Use springs for anything a finger or pointer drives (dragging, swiping, pulling) and for anything that may be interrupted halfway. A spring keeps its velocity when the target changes, so it never jumps; a timed curve restarts from zero and stutters.

| Role | For |
|---|---|
| `spring.snappy` | Presses, toggles, switches, small UI that should feel crisp |
| `spring.smooth` | Cards, sheets, screens, anything large that moves |
| `spring.bouncy` | Rare moments of delight: a goal reached, a first success. Never routine UI |

A spring's duration is the perceived duration, not an exact end time, and its bounce describes the overshoot (0 is none). Don't add a separate duration or delay on top of a spring: the spring already defines both.

## What to animate

**Transform and opacity only.** Moving, scaling, rotating and fading stay smooth at 60 frames per second because the device can do them without recalculating layout. Avoid animating width, height, top, left, margins, padding, shadows or blur on large areas: each frame forces layout or repainting, and phones drop frames.

**For size and position changes, use the platform's layout animation.** When a list item is removed and the rest close the gap, or a card expands into a detail view, let the platform animate the layout change rather than animating layout properties by hand.

**Keep moving things small and few.** One or two things moving at once is plenty. Never animate body text letter by letter or word by word; people are trying to read it.

## Choreography

**Container first, then content.** When a panel opens, the panel arrives, then its contents fade in. Content arriving before its container looks like it is floating loose.

**Stagger lists gently.** Offset each item by 20–40 ms, and stop staggering after about six to eight items: the rest appear together. A long stagger turns a list into a wait.

**Shared element transitions** keep people's place. The thumbnail they tapped grows into the detail image; the card they opened becomes the detail screen. Use them for the main path through the app, not every link.

**Direction follows navigation:**

- Forward slides in from the end edge; back slides in from the start edge. Both mirror in right-to-left languages.
- Sheets rise from the bottom and return there.
- Menus and popovers grow from the control that opened them.
- Tabs switch in place; they don't slide like a forward navigation.

## Feedback

**Press.** Scale to about 0.97–0.98 with `spring.snappy`, starting within 100 ms of the touch. A press that responds late feels broken, however nice it looks. Hover effects belong only to devices with a fine pointer; on touch they stick after a tap.

**Loading.**

- Under about 300 ms, show nothing: a flash of a loading state is worse than a short wait.
- For content, a skeleton that keeps the final layout, with a gentle opacity pulse (no shimmer sweeping across the screen).
- For tasks longer than about a second, a progress bar, determinate when you know the progress.
- When content arrives, cross-fade from skeleton to content with `duration.fast`.

**Success.** A short, specific confirmation: a check mark that draws in, a toast that says what happened ("Invite sent"), a button that briefly shows a tick. Confetti and fireworks only where the brief asks for celebration.

**Errors.** A small horizontal shake (three quick oscillations, `duration.base` overall) on a field that rejected input, together with the error text. Never only the shake.

## Page and screen transitions

**Web.** Keep page transitions short (no longer than `duration.base`): a quick fade, or a small slide of the content area. Keep the header and navigation still so the page feels stable. Never block input while a transition runs.

**Mobile.** Follow the platform's navigation model: push and pop for drilling in and out, sheets for focused tasks, tabs that switch without sliding. People know these motions already; inventing new ones makes the app feel foreign.

## Reduced motion

When the viewer asks for reduced motion (`prefers-reduced-motion` on the web, the reduce-motion setting on iOS and Android):

- **Remove movement:** slides, scales, parallax, zooms, auto-playing carousels and looping animations.
- **Keep** opacity fades and colour changes: they communicate state without triggering motion sickness.
- Replace a slide-in sheet with a fade; replace a shared element transition with a cross-fade.

Never auto-play video or carousels without a visible pause control, whatever the setting.

`motif shot --audit` emulates reduced motion and reports anything that still moves.

## Performance

- Aim for 60 frames per second on a mid-range phone, not on your development machine.
- Don't animate shadows or filters (blur, saturation) over large areas. To show something rising, animate the opacity of a second, pre-drawn shadow instead.
- Hint the browser that something will move (`will-change` on the web) only just before it moves, and remove the hint afterwards.
- Trigger scroll animations when an element enters the viewport (intersection-based triggers), run them once, and never drive animation from raw scroll events.

## Pattern catalogue

| Pattern | Roles | Notes |
|---|---|---|
| Button press | `spring.snappy` | Scale to 0.97–0.98 on press, back on release |
| Toggle switch | `spring.snappy` | Thumb slides; track colour changes with `duration.fast` |
| Menu open / close | `duration.base`, `easing.enter` / `easing.exit` | Grow from the trigger with a fade; close quicker than open |
| Toast in / out | `duration.base`, `easing.enter` / `easing.exit` | Slide a short way from the nearest edge with a fade; auto-dismiss after at least 5 s (longer for longer text); a toast with an action stays until dismissed |
| Bottom sheet | `spring.smooth` | Rises from the bottom; follows the finger when dragged; dismisses past a threshold or with a quick flick |
| Dialog | `duration.base`, `easing.enter` | Fade the backdrop; scale the dialog from 0.96 to 1 with a fade |
| List item added / removed | `spring.smooth` | New item fades and expands into place; neighbours close the gap with a layout animation |
| Tab change indicator | `spring.snappy` | The underline or pill slides to the new tab; the content switches in place |
| Accordion | `duration.base`, `easing.standard` | Height through the platform's layout animation; chevron rotates 180° |
| Skeleton to content | `duration.fast` | Cross-fade; content keeps the skeleton's layout |
| Pull to refresh (mobile) | `spring.smooth` | Indicator follows the finger, springs back when released |
| Success check | `duration.slow`, `easing.enter` | Stroke draws in once; no loop |

## Reviewing motion

Before you show a screen, and when you review one, check:

1. Every animation explains a change; nothing moves just to look lively.
2. Durations, curves and springs are motion roles, never raw numbers (`motif check` finds raw timings).
3. Only transform and opacity animate; layout changes use the platform's layout animation.
4. Presses respond within 100 ms; nothing makes people wait for an animation before they can act.
5. Exits are quicker than entrances, and anything that can be interrupted uses a spring.
6. Lists stagger briefly and stop staggering after the first few items.
7. Direction matches navigation, and mirrors in right-to-left languages.
8. With reduced motion on, nothing slides, scales or loops, and every state change is still visible.
