import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const port = 18_787;
const baseUrl = `http://127.0.0.1:${port}`;
let child;
let client;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Test server did not start");
}

test.before(async () => {
  child = spawn(process.execPath, ["dist/server.js"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer();

  client = new Client({ name: "widget-test-suite", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
});

test.after(async () => {
  await client?.close();
  child?.kill("SIGTERM");
});

test("health endpoint identifies the MCP route", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    name: "Pocket Pulse Widget Test",
    status: "ok",
    mcp: "/mcp",
  });
});

test("MCP endpoint accepts browser preflight requests", async () => {
  const response = await fetch(`${baseUrl}/mcp`, { method: "OPTIONS" });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});

test("discovers render and interaction tools", async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    ["add_demo_expense", "reset_demo_spending", "show_spending_widget"],
  );

  const renderTool = tools.find((tool) => tool.name === "show_spending_widget");
  assert.equal(renderTool?._meta?.ui?.resourceUri, "ui://pocket-pulse/spending.html");
});

test("serves an MCP Apps HTML resource", async () => {
  const resource = await client.readResource({ uri: "ui://pocket-pulse/spending.html" });
  assert.equal(resource.contents.length, 1);
  assert.match(resource.contents[0].mimeType, /text\/html/);
  assert.match(resource.contents[0].text, /ui\/initialize/);
  assert.match(resource.contents[0].text, /tools\/call/);
  assert.match(resource.contents[0].text, /Pocket Pulse/);
});

test("renders mock data and handles a widget-originated mutation", async () => {
  await client.callTool({ name: "reset_demo_spending", arguments: {} });
  const before = await client.callTool({ name: "show_spending_widget", arguments: {} });
  const beforeState = before.structuredContent;

  assert.equal(beforeState.spent, 28_450);
  assert.equal(beforeState.interactionCount, 0);

  const after = await client.callTool({
    name: "add_demo_expense",
    arguments: { kind: "coffee" },
  });
  const afterState = after.structuredContent;

  assert.equal(afterState.spent, 28_800);
  assert.equal(afterState.interactionCount, 1);
  assert.equal(afterState.transactions[0].merchant, "Demo Coffee");
});
