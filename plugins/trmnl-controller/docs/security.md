# Security and privacy model

This is a local, single-user tool server. Any harness connected to it can exercise the tools it exposes within its configured TRMNL credentials. TRMNL scopes/resource restrictions are the primary authorization boundary. Use `TRMNL_READ_ONLY=1` for read-only sessions; tools are both hidden and blocked, including effectful GETs such as next-screen and setup.

HTTP requires a secret bearer token, rejects browser Origin headers, limits request sizes and validates loopback Host headers. Bind loopback by default. Remote use requires TLS at a trusted proxy plus restricted access. Do not expose this single-user server as a multi-tenant public service.

Account keys and device keys are separate and only go to configured profile origins. API redirects are rejected. Known secrets and sensitive response keys are redacted. Exported plugin archives may contain account secrets and remain local sensitive artifacts; review them before distribution. Source API values, user-authored files and URLs can contain sensitive data that generic redaction cannot recognize: do not put credentials into them.

Source fetching requires explicit host allowlists, rejects embedded credentials, blocks private/reserved addresses by default, pins DNS results for the connection, refuses redirects and limits time/bytes. Private network sources need an explicit host and `allowPrivateSources:true`. Source secret references must begin `TRMNL_SOURCE_`. No arbitrary code transforms are run. Authenticated source data can be published only by an explicitly configured target pipeline.

OAuth uses PKCE/state, a loopback listener, matching origin checks and a five-minute timeout. Windows token files are DPAPI-encrypted for the current user. Other platforms rely on 0700 directories/0600 files and host disk protection. Environment keys stay in the launching environment. Credentials never enter plugin artifacts.

Tool annotations guide harness approval UX; they are not a substitute for user authorization. Device changes, deleting plugins, unlinking accounts, booking rooms and installing paid apps have distinct consequences. Discover and inspect state first, apply only requested changes, and require the host's normal approvals for consequential actions.

Limitations: framework lint is not a sandbox for authored JavaScript; only preview trusted plugin source. Provider responses are untrusted content, never instructions. This release has no multi-user database, per-client OAuth authorization server or security audit claim.
