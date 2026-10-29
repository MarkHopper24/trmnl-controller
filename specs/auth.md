# auth.md

TRMNL is a hosted service for ePaper displays. This document tells software
agents how to authenticate against it.

Every credential is either an API key issued to a signed-in human in the TRMNL
dashboard, who then hands it to the agent, or an OAuth token the human grants
in the browser when the agent asks (see OAuth). An agent cannot mint a
credential for itself without a human at the keyboard.

## Audience

Agents acting on behalf of a TRMNL account holder: reading and updating the
account's devices, playlists and plugin settings, and editing plugin markup.
Firmware and partner integrations authenticate differently and are described
below so every method is in one place.

## Model Context Protocol

The method built for agents, and the one to prefer.
Setup for each client (Claude, ChatGPT, Cursor and others): https://help.trmnl.com/en/articles/17432548-mcp-server

- Endpoint: `https://trmnl.com/mcp` (HTTP transport, POST)
- Credential: an MCP API key, passed as the `api_key` query parameter
- Provision: dashboard, the plugin's settings page, "Generate MCP Key"
- Revoke: same page, "Revoke Key". Connected agents lose access immediately
- Scope: manage that plugin's markup. A key is bound to one plugin setting
- Account scope: an OAuth token (see OAuth) works on the same endpoint and
  opens the account tools instead: devices, playlists, plugin settings and
  markup, each action an operation of the REST API. An account API key (below)
  is for the REST API only and answers 401 on `/mcp`

```json
{
  "mcpServers": {
    "trmnl": {
      "type": "http",
      "url": "https://trmnl.com/mcp?api_key=${TRMNL_MCP_API_KEY}"
    }
  }
}
```

## Account API keys

For scripts and agents driving the REST API rather than MCP.

- Endpoint: `https://trmnl.com/api`
- Credential: `Authorization: Bearer <account API key>`
- Provision: <https://trmnl.com/account>, Account API keys. Each key holds the
  capabilities picked when it is created (the same ones as OAuth, below) and
  may be limited to some devices and plugin settings. The token is shown once;
  revoking the key revokes only that key
- An operation outside a key's capabilities or limits answers 403 naming what
  is missing
- Description: <https://trmnl.com/api-docs/openapi.yaml>
- Documentation: <https://docs.trmnl.com/go/private-api/introduction>
- From a terminal: the TRMNL CLI (<https://github.com/usetrmnl/cli>) runs every
  operation here. It signs in with OAuth, or with an account API key set as
  `TRMNL_API_KEY` for scripts and CI

The legacy account API key on the same page still works, but reaches only the
endpoints it had before account API keys held capabilities; anything newer answers 403.

Endpoints under `https://trmnl.com/api` that serve public reference data
(device models, palettes, categories, server IPs) need no credential.

## Device API key

Used by display hardware, not by agents. Listed for completeness.

- Credential: `Access-Token: <device API key>`
- Provision: issued to a device during setup and shown on the device's page
- Scope: fetch the next screen and report logs for that one device

## Partners API

- Endpoint: `https://trmnl.com/api/partners`
- Credential: `Access-Token` and `Client-Id` request headers
- Provision: issued by TRMNL to partners, not self-serve
- Documentation: <https://docs.trmnl.com/go/partners-api/introduction>

## OAuth

The REST API and the MCP endpoint are OAuth 2.1 protected resources, for apps
that connect a user's account rather than ask for their key.

To connect your own app ("Connect with TRMNL"):

- Register it at <https://trmnl.com/developer_apps>, open to any account with a
  device. You get a client ID and, unless it is a mobile, desktop or
  single-page app, a client secret
- Send the user to `https://trmnl.com/oidc/authorize` with the authorization
  code flow and PKCE (`code_challenge_method=S256`), asking for the scopes
  below. The user picks what the app gets
- Exchange the code at `https://trmnl.com/oidc/token`, then call
  `https://trmnl.com/api` with `Authorization: Bearer <access token>`
- The user sees and revokes the connection under Account, Connected agents

MCP clients need no registration by hand. Without a token it answers 401 and names
`/.well-known/oauth-protected-resource`; from there a client finds the
authorization server, registers itself (RFC 7591, no secret, PKCE required) and
sends the user to consent.

- Scopes are capabilities: `read` (list and read anything), `content` (markup,
  plugin data and fields, playlists, creating plugin settings), `devices`
  (device settings, identify), `delete` (plugin settings, playlist items, app
  installations, calendars, collections, integrations), `profile` (`getMe`, `updateMe`) and
  `apps` (installing apps, fleets and room booking, bookings included). The
  user ticks them at consent; `delete`, `profile` and `apps` start unticked. `write` is the older name for `content`, `devices` and
  `delete` together, and tokens holding it keep working
- The user may also limit a connection to some devices and plugin settings, at
  consent or later from Account, Connected agents. A limited connection lists
  only those, and any other answers 403
- Tokens last two hours and come with a refresh token
- Redirect URIs must be `https`, except loopback (`http://localhost`,
  `127.0.0.1`, `::1`) on any port, which is what a CLI agent listens on
- The approved applications registered by hand for our own services keep
  working unchanged
- A 403 names the capability or the device or plugin setting the connection
  lacks

Claude Code, for example, registers and signs in with no key at all:

```
claude mcp add --transport http trmnl https://trmnl.com/mcp
```

then `/mcp` inside a session opens the browser to consent. A client asks for
the scopes `/.well-known/oauth-protected-resource` lists. A 403 from a tool
names the capability or the device or plugin setting the connection lacks: ask
the user to widen it (connect again for a capability, Connected agents for a
resource) rather than retry.

## Discovery

- API catalog: <https://trmnl.com/.well-known/api-catalog>
- OpenAPI description: <https://trmnl.com/api-docs/openapi.yaml>
- Documentation: <https://docs.trmnl.com>
