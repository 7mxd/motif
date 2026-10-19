# 0006 — Design variants

- Date: 2026-10-19
- Status: Accepted
- Context: Apps sometimes need more than one look: HiSalon's women's and men's experiences, a white-label app's brand per customer, a partner store's palette. Part 2 adds this to the design guide for every stack ([the Part 2 spec §5](../specs/2026-10-19-motif-part2-all-stacks-design.md)). Larder, the React test app, shows it with a partner variant that changes the action and accent colours.

## Decisions

1. **A variant is a view of the same document, not a second document.** `design/tokens.json` declares the variants once at the root, and a role that differs adds its values for a variant next to its own. A role's `$value` and `modes.dark` stay the default variant's, so a guide without variants is unchanged, byte for byte, and every tool that reads the guide keeps reading it. One guide means one set of roles and readability pairs for every look, so a role can't exist in one variant and be missing in another, and a role that doesn't mention a variant simply uses the default's.
2. **On the web, a variant is chosen with `data-variant="<id>"` on `<html>`**, the element that already carries `data-theme`. It combines with `data-theme` and the system's dark setting in plain CSS (`:root[data-variant="<id>"]` blocks for light, dark by media query and `[data-theme="dark"]`), needs no JavaScript beyond setting an attribute, and works for Tailwind classes, plain CSS and every web stack alike. The default variant needs no attribute. The selector is scoped to `:root` so one place decides the look; an inner element with its own `data-theme` doesn't keep the variant.
3. **Variants are colours first.** The format lets any role vary, but a colour role needs both a light and a dark value and any other role takes one value. Colour is what audiences and brands actually differ in; varying type or corners changes layout, and layout that differs per variant is a different design. Anything a variant changes beyond theme values (icons, imagery, copy tone) is described in the `## Variants` section of `DESIGN.md`, not generated.
4. **Readability is checked per variant.** `motif validate` checks every pair in every variant, in light and dark, and says which one fails ("In the Partner variant, dark mode: …"). A variant that fails contrast is as broken as a default that does.
5. **Previews and screenshots take `--variant <id>` or `--variant all`**, and a variant's PNG adds `+<id>` to its name, so the default's names don't change.

## Consequences

- Larder's tests pin the format: its default look is unchanged, `motif validate` counts pairs × 4 checks (two variants, light and dark), and its generated `src/styles/motif.css` carries the partner block. A switch in its settings sets `data-variant`.
- Each new stack's generated code switches variant in its own idiom (the Part 2 spec §6 and §7); the guide and its checks stay the same.
- Generated variant blocks add to the style sheet's size for every variant declared, which is the price of switching with no code.
