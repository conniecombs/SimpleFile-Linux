# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x (latest) | Yes |
| 0.2.x and earlier | No |

Starting with v1.0.0, the current minor version receives security fixes. After the next
minor release, the two most recent minor versions will receive security fixes when practical.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report them privately using GitHub's
[Security Advisories](https://github.com/conniecombs/SimpleFile-Linux/security/advisories/new) feature.

Include the following in your report:

1. **Description** — What the vulnerability is and what an attacker could do with it
2. **Steps to reproduce** — Minimal steps to trigger the issue
3. **Impact** — Who is affected and under what conditions
4. **Suggested fix** (optional) — If you have a proposed patch

## Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgement | Within 48 hours |
| Severity assessment | Within 5 business days |
| Fix for critical issues | Within 14 days |
| Fix for high issues | Within 30 days |
| Public disclosure | After fix is released |

## Scope

The following are in scope:

- Path traversal vulnerabilities in the Rust backend
- Shell injection via file or directory names
- XSS in the frontend via unsanitized file/path data
- Privilege escalation via the Tauri command surface
- Insecure deserialization of data from the filesystem or network
- Unsafe installer, driver, or process-launch behavior

The following are out of scope:

- Vulnerabilities in Tauri, WebView2, or other upstream dependencies
  (please report those to the respective projects)
- Social engineering attacks
- Physical access attacks
- Denial-of-service via intentionally large or deeply nested directory structures
  (these are known limitations, not exploitable vulnerabilities)

## Known Security Considerations

- The app requires filesystem access to function. It does not sandbox file operations beyond
  Tauri's permission model.
- FTP connections are unencrypted unless the server uses FTPS. Do not use FTP over untrusted networks.
- Terminal and Open With flows use scoped backend process-launch commands. Open With blocks shells
  and scripting runtimes and only allows executable targets from trusted install locations.
- Automatic updater artifacts are disabled until the updater public key, endpoint, and signing
  keys are configured together.
- CI runs `cargo audit --deny warnings`. The current accepted advisory list is limited to
  transitive Tauri/Linux GTK and `urlpattern` warnings: RUSTSEC-2024-0370, RUSTSEC-2024-0411
  through RUSTSEC-2024-0420, RUSTSEC-2024-0429, RUSTSEC-2025-0075, RUSTSEC-2025-0080,
  RUSTSEC-2025-0081, RUSTSEC-2025-0098, and RUSTSEC-2025-0100. New advisories should either be
  fixed or documented with a specific rationale before being added to the accepted list.
