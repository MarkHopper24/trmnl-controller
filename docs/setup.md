# Setup and authentication

Use Node.js >=22.19.0 (the minimum required by the HTTP dependency). Stdio works in a local MCP harness; Streamable HTTP works in clients with HTTP MCP support. A browser-only harness needs an accessible HTTPS service or a supported local bridge.

`trmnl_status` reports configuration and credential presence. It is not a network/authentication check. Follow it with public model discovery and, after login, `trmnl_list_devices`.

## OAuth

Use `trmnl_auth_start` or `node src/cli.mjs login`. The user opens the returned URL, chooses capabilities and resources, and grants access. Keep the process running for the loopback callback. The default scopes are read/content/devices. Delete/profile/apps must be explicitly requested when their workflows need them. `trmnl_auth_status` reports completion; `trmnl_auth_cancel` closes a pending listener.

The login uses official discovery, dynamic public-client registration, random state, PKCE S256 and a loopback callback. It stores tokens using Windows user-bound DPAPI or owner-only files on other systems. Expiring tokens refresh automatically. To disconnect locally use `logout`; revoke server-side access in TRMNL Account → Connected agents.

See [TRMNL auth protocol](https://trmnl.com/auth.md) and [Account API](https://docs.trmnl.com/go/private-api/account). OAuth for the local client is distinct from serving OAuth to remote MCP users; this server's HTTP mode uses a shared bearer credential and is single-user.

## Account and device keys

Alternatively set `TRMNL_API_KEY` outside chat. Modern `trmnl_` account keys have selected capabilities and resource restrictions. Legacy `user_` keys cover fewer endpoints. Device keys use `Access-Token` and only the device API. Do not interchange them. Partner credentials are separate again.

Configure separate profiles for devices/accounts/BYOS with `baseUrl`, `tokenEnv` and `deviceTokenEnv`. The host configuration controls origins; tools cannot override the destination to steal credentials. Only explicitly configured BYOS HTTP origins may opt into `allowInsecureHttp`. BYOS servers can implement a smaller API.

## Local files

Default state: `~/.trmnl-control/`. Override with `TRMNL_HOME`. Config: `~/.trmnl-control/config.json`, or `TRMNL_CONFIG`. Projects, exported artifacts, pipeline definitions and safe run state live under this directory. Credential files are excluded from build bundles and repository distribution.

Changes to config/environment require restarting the MCP process. No tools modify harness security policy, install OS tasks, or grant cloud account privileges.
