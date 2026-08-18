# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x (current) | Yes |
| 1.x and earlier published tags | No |

0.1.x is the current line. Security fixes land on the latest 0.1.x release.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report them privately with
[GitHub Security Advisories](https://github.com/conniecombs/SimpleFile-Linux/security/advisories/new).

Include:

1. **Description** — what is wrong and what an attacker could do
2. **Steps to reproduce** — a minimal sequence
3. **Impact** — who is affected and under what conditions
4. **Suggested fix** — optional

## Response targets

| Stage | Target |
|---|---|
| Acknowledgement | Within 48 hours |
| Severity assessment | Within 5 business days |
| Fix for critical issues | Within 14 days |
| Fix for high issues | Within 30 days |
| Public disclosure | After a fix is released |

## Scope

In scope:

- Path traversal in Rust commands
- Command injection through file or directory names
- XSS from unsanitized file or path data in the UI
- Privilege issues on the Tauri command surface
- Insecure handling of on-disk or updater metadata
- Unsafe installer or process-launch behavior

Out of scope:

- Vulnerabilities in Tauri, WebKitGTK, or other upstream projects
- Social engineering
- Attacks that require physical access
- Denial of service from intentionally huge or deeply nested trees

## Known considerations

- SimpleFile needs broad filesystem access. It does not sandbox individual
  file operations beyond Tauri's capability model.
- Terminal and Open With use scoped backend launchers. Open With blocks shells
  and scripting runtimes and only accepts executables from trusted locations.
- Archive extraction rejects path-traversal entries.
- Published updater artifacts are signed. Draft installer-only builds do not
  publish `latest.json`.
- CI runs `cargo audit --deny warnings`. The accepted list is limited to
  known transitive Tauri/Linux GTK and `urlpattern` advisories documented in
  the audit script. New advisories must be fixed or accepted with a specific
  rationale.
