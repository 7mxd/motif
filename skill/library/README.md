# Library

Motif's own pieces for app screens: charts, cards, screens, motion and accents, each written for all nine stacks. Nothing here needs a sign-up, a key or a download, and nothing is fetched. Every piece is a recipe: adapt it to the app, using only the design guide's roles (colours, spacing, corners, type, motion), then run `motif check`.

## How to pick

1. **Loudness from the brief.** Read the personality words in `DESIGN.md` section 1 and the dial in [character](../knowledge/character.md). Calm, precise or business briefs take `calm` and `default` pieces; friendly or gentle ones `default`; playful, energetic or bold ones may take `loud`. Every brief gets at least one crafted piece on each first-impression screen (welcome, landing, sign-in, empty states) and on the home screen: the floor is a key-figure card with a trend line, a progress ring or segmented bar, and status colour on what needs action.
2. **Group from the screen's job.** Read the screen's UX pattern guide in `knowledge/ux-patterns/` first (its "What strong apps show" note says what belongs there), then pick: numbers people track → charts; what to act on now → cards; first impressions and moments → screens; the brand's own touch → the accent for the guide's starting style.
3. **Motion from the level.** Every piece names the default motions it uses. Play them at the level set in [motion](../knowledge/motion.md#default-motion-and-level): `lively`, `default`, `calm` or `none`.
4. **Only the app's own data.** A chart or card shows the person's real figures or a next action, never filler. An app without numbers fills with its own content: the next meetup, the upcoming trip, saved routes, people, counts and progress.
5. **The developer can ask for a different piece.** Offer the alternative in plain words ("a progress ring instead of the bar?"), and keep the guide's roles either way.
6. **Into what the app already has.** Build a piece as a variant of an existing component (an `EmptyState` with a drawing, a `Badge` for a count) or inside the screen's own folder. One that has to be a new shared component is proposed like any new component and recorded by its name in `DESIGN.md` section 5.

Never go into the "C look": glowing charts, tilted cards, a gradient backdrop behind everything, colour on every surface ([anti-patterns](../knowledge/anti-patterns.md)).

## Pieces

| Piece | Group | Loudness | Fits | File |
|---|---|---|---|---|
| Trend line | charts | calm | a key figure's last weeks or months | [trend-line](charts/trend-line.md) |
| Progress ring | charts | calm | a goal or a share done (paid this month, today's steps) | [progress-ring](charts/progress-ring.md) |
| Segmented bar | charts | calm | parts of a whole (invoices by age, time by project) | [segmented-bar](charts/segmented-bar.md) |
| Period bars | charts | calm | a few periods side by side, the current one highlighted | [period-bars](charts/period-bars.md) |
| Stat with change | charts | calm | one figure and how it moved | [stat-change](charts/stat-change.md) |
| Key-figure card | cards | default | the home screen's main figure, once per screen | [key-figure-card](cards/key-figure-card.md) |
| Stat row | cards | calm | two to four figures people act on | [stat-row](cards/stat-row.md) |
| Today's focus | cards | default | the one next thing, with its action | [todays-focus](cards/todays-focus.md) |
| Item card | cards | default | items with a look of their own (places, plants, trips) | [item-card](cards/item-card.md) |
| Landing hero | screens | default | a web landing page, by personality | [landing-hero](screens/landing-hero.md) |
| Welcome | screens | default | a native welcome and onboarding | [welcome](screens/welcome.md) |
| Empty state | screens | default | a list or screen with nothing yet | [empty-state](screens/empty-state.md) |
| Success moment | screens | default | after a key action | [success-moment](screens/success-moment.md) |
| Draw-in | motion | default | every chart, on first show | [draw-in](motion/draw-in.md) |
| Count-up | motion | default | a key figure arriving | [count-up](motion/count-up.md) |
| Stagger | motion | default | a list or row of cards arriving | [stagger](motion/stagger.md) |
| Press | motion | calm | primary and key actions | [press](motion/press.md) |
| Success | motion | default | a key action confirming itself | [success](motion/success.md) |
| Bold accent | accents | loud | the Bold style | [bold](accents/bold.md) |
| Dark tech accent | accents | default | the Dark tech style | [dark-tech](accents/dark-tech.md) |
| Editorial accent | accents | calm | the Editorial style | [editorial](accents/editorial.md) |
| Minimal accent | accents | calm | the Minimal style | [minimal](accents/minimal.md) |
| Playful accent | accents | loud | the Playful style | [playful](accents/playful.md) |
| Soft accent | accents | default | the Soft style | [soft](accents/soft.md) |
| Trust accent | accents | calm | the Trust style | [trust](accents/trust.md) |
| Warm accent | accents | default | the Warm style | [warm](accents/warm.md) |

The Loudness column is each piece's usual level; a piece's own file can say how to turn it up or down.
