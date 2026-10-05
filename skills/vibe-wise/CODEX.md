# Codex integration

Source: https://github.com/nykooi1/vibe-wise

Imported commit: `1135f4ae8205da78404a71e85f567d5911da4e4d`.

This directory preserves the upstream Git-tracked source, without a nested `.git`
directory. `SKILL.md`, `agents/openai.yaml`, and this file add Codex integration.
The upstream MIT license remains in `LICENSE`.

Install by linking this directory into `~/.codex/skills/vibe-wise` (or
`$CODEX_HOME/skills/vibe-wise`) using the parent skills README's instructions.
Invoke `$vibe-wise` to start or resume learning, or ask `$vibe-wise` to reset
learning notes. The reset operation previews changes and requires confirmation.
Explicit invocation preserves the original plugin's invocation policy.

The upstream README describes Claude Code installation and commands. Those do not
apply to this Codex installation. Automatic session restoration through Claude
hooks is unavailable in Codex; invoke the skill again in each new chat.

To update, replace upstream files from a reviewed source commit, retain the three
Codex integration files, update this commit reference, and run the upstream tests.
