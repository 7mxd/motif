---
name: init
description: Motif — start a new app (run it as /motif:init; plain /init is Claude Code's own). Asks a few questions, shows two or three looks side by side, then writes the design guide, theme code, starter components and first screens.
argument-hint: "[what the app is]"
disable-model-invocation: true
---

Use the Motif skill. Read ${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md first (its skill folder is ${CLAUDE_PLUGIN_ROOT}/skills/motif), then follow ${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/init.md.

Ask the developer every question with the AskUserQuestion tool: it's the question prompt Motif's rules mean.

What the developer asked for: $ARGUMENTS
