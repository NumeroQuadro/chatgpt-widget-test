import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 8787);
const MCP_PATH = "/mcp";
const WIDGET_URI = "ui://pocket-pulse/spending.html";
const widgetHtml = readFileSync(
  fileURLToPath(new URL("../public/spending-widget.html", import.meta.url)),
  "utf8",
);

type DemoExpenseKind = "coffee" | "metro";

type Transaction = {
  id: string;
  merchant: string;
  category: string;
  emoji: string;
  amount: number;
  time: string;
};

type SpendingState = {
  currency: "RUB";
  period: string;
  budget: number;
  spent: number;
  categories: Array<{
    name: string;
    emoji: string;
    amount: number;
    color: string;
  }>;
  transactions: Transaction[];
  interactionCount: number;
};

const initialState = (): SpendingState => ({
  currency: "RUB",
  period: "September 2026",
  budget: 50_000,
  spent: 28_450,
  categories: [
    { name: "Food", emoji: "🍜", amount: 9_820, color: "#ff8a5b" },
    { name: "Transport", emoji: "🚇", amount: 4_100, color: "#6c8cff" },
    { name: "Fun", emoji: "🎮", amount: 3_600, color: "#b67cff" },
    { name: "Other", emoji: "✨", amount: 10_930, color: "#3ecf9a" },
  ],
  transactions: [
    {
      id: "seed-1",
      merchant: "Surf Coffee",
      category: "Food",
      emoji: "☕️",
      amount: 350,
      time: "Today, 10:42",
    },
    {
      id: "seed-2",
      merchant: "Yandex Plus",
      category: "Fun",
      emoji: "🎧",
      amount: 399,
      time: "Yesterday",
    },
    {
      id: "seed-3",
      merchant: "Metro",
      category: "Transport",
      emoji: "🚇",
      amount: 75,
      time: "Yesterday",
    },
  ],
  interactionCount: 0,
});

let state = initialState();

const spendingOutputSchema = {
  currency: z.literal("RUB"),
  period: z.string(),
  budget: z.number(),
  spent: z.number(),
  categories: z.array(
    z.object({
      name: z.string(),
      emoji: z.string(),
      amount: z.number(),
      color: z.string(),
    }),
  ),
  transactions: z.array(
    z.object({
      id: z.string(),
      merchant: z.string(),
      category: z.string(),
      emoji: z.string(),
      amount: z.number(),
      time: z.string(),
    }),
  ),
  interactionCount: z.number().int(),
};

function response(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: structuredClone(state),
  };
}

function addExpense(kind: DemoExpenseKind) {
  const expense =
    kind === "coffee"
      ? {
          merchant: "Demo Coffee",
          category: "Food",
          emoji: "☕️",
          amount: 350,
        }
      : {
          merchant: "Demo Metro",
          category: "Transport",
          emoji: "🚇",
          amount: 75,
        };

  state.spent += expense.amount;
  const category = state.categories.find((item) => item.name === expense.category);
  if (category) category.amount += expense.amount;
  state.interactionCount += 1;
  state.transactions.unshift({
    id: `demo-${Date.now()}-${state.interactionCount}`,
    ...expense,
    time: "Just now",
  });
  state.transactions = state.transactions.slice(0, 5);

  return expense;
}

export function createDemoMcpServer() {
  const server = new McpServer({
    name: "pocket-pulse-widget-test",
    version: "0.1.0",
  });

  registerAppResource(
    server,
    "Pocket Pulse spending widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: { prefersBorder: true },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "show_spending_widget",
    {
      title: "Show demo spending dashboard",
      description:
        "Displays an interactive Pocket Pulse spending dashboard with safe mock data. Use this when the user asks to test, show, or interact with the demo widget.",
      inputSchema: {},
      outputSchema: spendingOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/toolInvocation/invoking": "Opening Pocket Pulse…",
        "openai/toolInvocation/invoked": "Pocket Pulse is ready.",
      },
    },
    async () => response("Here is the interactive demo spending dashboard."),
  );

  registerAppTool(
    server,
    "add_demo_expense",
    {
      title: "Add a demo expense",
      description:
        "Adds a Coffee or Metro purchase to the in-memory demo dashboard. This never touches real financial data.",
      inputSchema: {
        kind: z.enum(["coffee", "metro"]),
      },
      outputSchema: spendingOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Adding demo expense…",
        "openai/toolInvocation/invoked": "Demo expense added.",
      },
    },
    async ({ kind }: { kind: DemoExpenseKind }) => {
      const expense = addExpense(kind);
      return response(`Added ${expense.merchant} for ₽${expense.amount}.`);
    },
  );

  registerAppTool(
    server,
    "reset_demo_spending",
    {
      title: "Reset demo spending",
      description:
        "Resets only the in-memory mock spending dashboard to its original values.",
      inputSchema: {},
      outputSchema: spendingOutputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        "openai/toolInvocation/invoking": "Resetting demo…",
        "openai/toolInvocation/invoked": "Demo reset.",
      },
    },
    async () => {
      state = initialState();
      return response("Reset the demo spending dashboard.");
    },
  );

  return server;
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse) {
  setCorsHeaders(res);
  const server = createDemoMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error("MCP request failed", error);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
}

export const httpServer = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        name: "Pocket Pulse Widget Test",
        status: "ok",
        mcp: MCP_PATH,
      }),
    );
    return;
  }

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (
    url.pathname === MCP_PATH &&
    req.method &&
    new Set(["POST", "GET", "DELETE"]).has(req.method)
  ) {
    await handleMcpRequest(req, res);
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

if (process.env.NODE_ENV !== "test") {
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Pocket Pulse MCP listening on http://localhost:${PORT}${MCP_PATH}`);
  });
}
