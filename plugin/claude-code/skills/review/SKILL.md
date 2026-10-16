---
name: review
description: Motif — review and improve your app's look (run it as /motif:review; plain /review is Claude Code's own). Ranked findings in plain words, then the fixes you choose, with screenshots from before and after.
argument-hint: "[screens or features, or leave empty for the whole app]"
disable-model-invocation: true
---

Use the Motif skill. Read ${CLAUDE_PLUGIN_ROOT}/skills/motif/SKILL.md first (its skill folder is ${CLAUDE_PLUGIN_ROOT}/skills/motif), then follow ${CLAUDE_PLUGIN_ROOT}/skills/motif/modes/review.md.

Ask the developer every question with the AskUserQuestion tool: it's the question prompt Motif's rules mean.

What the developer asked for: $ARGUMENTS
