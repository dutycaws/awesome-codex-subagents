---
name: vibe-wise
description: Learning-first development with VibeWise. Lead the design, explore tradeoffs, and have Codex implement the agreed steps. Activate, resume, or explicitly reset project learning notes.
---

# VibeWise for Codex

For activation or resume, read [Learn](skills/learn/SKILL.md) and follow its linked
behavior, onboarding, and state guidance. For an explicit request to reset learning
notes, read [Reset](skills/reset/SKILL.md), preserving its preview, confirmation,
and backup workflow. Otherwise start Learn.

Apply these host adaptations when reading the upstream guides:

- References to Claude mean Codex. Use available file-reading and search tools
  for Read and Glob. Use a supported question tool where appropriate, or ask in
  chat and wait for the user's answer. Tool permission is not checkpoint approval.
- Resolve `${CLAUDE_PLUGIN_ROOT}` to the absolute directory containing this file;
  substitute that path directly into helper commands, safely quoted. No Claude
  environment variable or Claude installation is required.
- `/vibe-wise:learn` means invoke `$vibe-wise`; `/vibe-wise:reset` means ask
  `$vibe-wise` to reset learning notes. Resolve upstream relative links against
  the guide containing them.
- Codex does not run the bundled Claude SessionStart hook. On explicit activation
  or resume, restore state through Learn's state lookup. In a new chat, invoke
  `$vibe-wise` again; installation alone does not activate learning mode.

The original plugin source and MIT license are retained alongside this entry point.
See [CODEX.md](CODEX.md) for source provenance and installation details.
