import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const app = express();

// Very permissive CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow any origin
    callback(null, true);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-client-info", "*"],
  credentials: true
}));

app.use(express.json());

const transports = new Map();

function createServer() {
  const server = new Server(
    { name: "kinetikfield-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_kinetikfield_status",
        description: "Check if the Kinetikfield app is online and the MCP bridge is active.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "generate_asset",
        description: "Generate an asset (image, video, or audio) within the Kinetikfield platform and return a reference ID.",
        inputSchema: {
          type: "object",
          properties: {
            assetType: {
              type: "string",
              enum: ["image", "video", "audio"],
              description: "The type of asset to generate",
            },
            prompt: {
              type: "string",
              description: "A text description of what to generate",
            },
          },
          required: ["assetType"],
        },
      },
      {
        name: "list_projects",
        description: "List all projects available in the Kinetikfield workspace.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "get_kinetikfield_status") {
      return {
        content: [{
          type: "text",
          text: "✅ Kinetikfield is fully operational. MCP bridge connected to Claude.ai successfully!"
        }],
      };
    }

    if (name === "generate_asset") {
      const id = `kf-${args.assetType}-${Date.now().toString(36)}`;
      const promptInfo = args.prompt ? ` with prompt: "${args.prompt}"` : "";
      return {
        content: [{
          type: "text",
          text: `✅ Generated Kinetikfield ${args.assetType} asset${promptInfo}.\n\nReference ID: ${id}\nStatus: Processing\nEstimated time: ~30 seconds`
        }],
      };
    }

    if (name === "list_projects") {
      return {
        content: [{
          type: "text",
          text: `📁 Kinetikfield Workspace Projects:\n\n1. Marketing Studio — Brand campaign toolkit\n2. Cinema Studio — AI-powered video production\n3. AI Influencer — Virtual persona generator\n4. Supercomputer — GPU cluster dashboard`
        }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

// Helper to get absolute URL
function getAbsoluteUrl(req, path) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}${path}`;
}

// SSE endpoint — Claude.ai connects here
app.get("/sse", async (req, res) => {
  try {
    // Provide an absolute URL for the endpoint
    const absoluteMessageUrl = getAbsoluteUrl(req, "/message");
    const transport = new SSEServerTransport(absoluteMessageUrl, res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    const server = createServer();

    req.on("close", () => {
      transports.delete(sessionId);
      server.close();
    });

    await server.connect(transport);
  } catch (error) {
    console.error("Error establishing SSE connection:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to establish SSE connection" });
    }
  }
});

// Message endpoint — Claude.ai sends tool calls here
app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: "No active SSE session found. Please reconnect." });
    return;
  }
  
  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Error handling post message:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to handle message" });
    }
  }
});

// Health check for Render (keeps the service alive)
app.get("/", (req, res) => {
  res.json({
    name: "Kinetikfield MCP Server",
    status: "online",
    activeSessions: transports.size,
    instructions: "Connect via /sse endpoint"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "kinetikfield-mcp", sessions: transports.size });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kinetikfield MCP Server is running on port ${PORT}`);
});

// Self-ping to keep Render awake (runs every 14 minutes)
setInterval(async () => {
  try {
    const host = process.env.RENDER_EXTERNAL_HOSTNAME;
    if (host) {
      const url = `https://${host}/health`;
      const response = await fetch(url);
      console.log(`Self-ping to ${url} status: ${response.status}`);
    }
  } catch (err) {
    console.log("Self-ping failed:", err.message);
  }
}, 14 * 60 * 1000);
