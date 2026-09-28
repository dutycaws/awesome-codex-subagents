# Package validation

Version: 1.1.0. Checked September 28, 2026.

22 local static/documentation checks passed:

- Skill metadata parses and includes name/description.
- Workflow and plan contract consistently use version 1.1.0.
- Workflow rules contain no fixed model ID or Astra/Luna assignment.
- Skill invocation remains explicit-only.
- Display metadata is model-neutral and concise.
- Editable defaults preserve selected parent and explicit Luna Max workers.
- YAML examples parse and specify Sol Ultra supervisor/implementer with Luna Max verifier.
- Default-worker override preserves explicit role override.
- Explicit all-worker override clears conflicting role settings.
- Model-only override preserves effort for explicit compatibility checking.
- Arbitrary future model/effort strings are not statically whitelisted.
- Configuration shape rejects invalid schema/keys/empty values/worker inheritance.
- implementer TOML parses with generic name and no model/permission pins.
- implementer profile prohibits recursive delegation.
- verifier TOML parses with generic name and no model/permission pins.
- verifier profile prohibits recursive delegation.
- specialist TOML parses with generic name and no model/permission pins.
- specialist profile prohibits recursive delegation.
- All skill-relative dependencies exist.
- Core phase, delegation, validation, migration, and stopping guards remain.
- No accidental old Luna-specific profiles shipped.
- Files contain no em dash characters.

The configuration-resolution checks used a local authoring checker to verify the
examples against the documented merge rules. They do not establish that an agent
will follow those rules. This skill remains instruction-based, with no installed
resolver or automatic native configuration writer.

YAML and TOML parsing establish syntax, not model availability, native profile
loading, or actual routing. No ChatGPT/Codex desktop execution, agent evaluation,
model invocation, or client-side model/effort selection was tested. Run the smoke
cases in TEST_CASES.md through your own client before a long unattended task.
