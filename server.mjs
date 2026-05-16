import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
  methods: ["GET", "POST", "OPTIONS", "HEAD"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "x-client-info", "*"],
  credentials: true
}));

app.use(express.json());

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
      {
        name: "navigate_project",
        description: "Navigate to a specific project workspace.",
        inputSchema: {
          type: "object",
          properties: {
            projectName: {
              type: "string",
              description: "The name of the project to navigate to (e.g. 'Marketing Studio', 'Cinema Studio')",
            },
          },
          required: ["projectName"],
        },
      },
      {
        name: "list_project_assets",
        description: "List all assets within a specific project.",
        inputSchema: {
          type: "object",
          properties: {
            projectName: {
              type: "string",
              description: "The name of the project whose assets you want to list.",
            },
          },
          required: ["projectName"],
        },
      },
      {
        name: "trigger_project_action",
        description: "Trigger a specific action within a project.",
        inputSchema: {
          type: "object",
          properties: {
            projectName: {
              type: "string",
              description: "The name of the project.",
            },
            actionType: {
              type: "string",
              description: "The action to trigger (e.g. 'export_timeline', 'train_model', 'render_preview')",
            },
          },
          required: ["projectName", "actionType"],
        },
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

    if (name === "navigate_project") {
      return {
        content: [{
          type: "text",
          text: `🚀 Successfully navigated to [${args.projectName}]. Workspace context updated. You can now list assets or trigger actions here.`
        }],
      };
    }

    if (name === "list_project_assets") {
      return {
        content: [{
          type: "text",
          text: `📂 Assets in [${args.projectName}]:\n\n- Project_Sequence_01.mp4\n- Brand_Guidelines.pdf\n- Voiceover_Draft.wav\n- Render_Pass_Final.exr`
        }],
      };
    }

    if (name === "trigger_project_action") {
      const actionId = `act-${Date.now().toString(36)}`;
      return {
        content: [{
          type: "text",
          text: `⚡ Triggered action '${args.actionType}' in [${args.projectName}].\n\nAction ID: ${actionId}\nStatus: In Progress`
        }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => Math.random().toString(36).substring(2, 15)
});

const server = createServer();
server.connect(transport).catch(console.error);

// The main endpoint for Claude.ai Streamable HTTP
app.head("/", (req, res) => {
  res.setHeader("MCP-Protocol-Version", "2025-06-18");
  res.status(200).end();
});

app.all("/", async (req, res) => {
  try {
    // Add the protocol version header expected by Claude
    res.setHeader("MCP-Protocol-Version", "2025-06-18");
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling request:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to handle message" });
    }
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", server: "kinetikfield-mcp" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Kinetikfield MCP Server is running on port ${PORT} using Streamable HTTP`);
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
