---
name: feature
description: Motif — add a screen or flow that matches your app (/feature). Shows a mockup first, builds from your design guide and components, then compares the app with the mockup.
argument-hint: "[the feature]"
disable-model-invocation: true
---

Use the Motif skill. Read ${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md first (its skill folder is ${CLAUDE_PLUGIN_ROOT}/skills/motif), then follow ${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/feature.md.

Ask the developer every question with the AskUserQuestion tool: it's the question prompt Motif's rules mean.

What the developer asked for: $ARGUMENTS
