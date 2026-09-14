# Pocket Pulse — ChatGPT widget test

A deliberately small MCP Apps server for checking whether a ChatGPT account can render and interact with custom widgets. It uses mock spending data only: there is no bank connection, database, authentication, OpenAI API key, or real money involved.

The widget proves three things:

- ChatGPT discovers a Streamable HTTP MCP server.
- A tool can render a `ui://` HTML resource with structured data.
- Buttons in the iframe can call MCP tools and refresh the widget state.

## What you should see

An inline **Pocket Pulse** spending card showing a ₽50,000 demo budget, category bars, and recent transactions. Click **+ Coffee · ₽350**, **+ Metro · ₽75**, or **Reset demo** to send actual `tools/call` requests from the widget to this server.

The state is intentionally in memory and shared by the running demo process. Restarting the server restores the original values.

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm test
npm run dev
```

The health endpoint is `http://localhost:8787/` and the MCP endpoint is:

```text
http://localhost:8787/mcp
```

For an isolated Docker deployment, run `docker compose up -d --build`. The
included Compose file publishes the app only on `127.0.0.1:2096` for a reverse
proxy to consume.

## Make it reachable from ChatGPT

ChatGPT needs a public HTTPS endpoint. For a short test with Cloudflare Quick Tunnel:

```bash
cloudflared tunnel --url http://localhost:8787
```

Copy the generated `https://...trycloudflare.com` URL and append `/mcp`.

For this repository's current test deployment, use:

```text
https://mcp.numeroquadrogoofyahhcat.ru/widget-test/mcp
```

## Add it in ChatGPT

1. Turn on **Developer mode** in ChatGPT settings.
2. Open **Plugins**, choose **+**, and create a plugin using the public URL ending in `/mcp`.
3. Start a new chat and enable **Pocket Pulse Widget Test**.
4. Say: `Use Pocket Pulse Widget Test and show me the interactive spending widget.`
5. Once the card appears, click Coffee or Metro. The total, category, transaction list, and interaction counter should update.

If ChatGPT discovers all three tools but displays only text, the account can connect custom MCP servers but widget rendering is not enabled for that account or rollout.

## Implementation notes

The app follows the current MCP Apps path:

- `registerAppResource` serves `public/spending-widget.html` as `RESOURCE_MIME_TYPE`.
- `show_spending_widget` links the resource with `_meta.ui.resourceUri`.
- The resource initializes the `ui/*` JSON-RPC bridge over `postMessage`.
- Widget buttons call `add_demo_expense` and `reset_demo_spending` using `tools/call`.
- Every tool remains useful without the iframe because it also returns text and `structuredContent`.

Official reference: [OpenAI MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart).
