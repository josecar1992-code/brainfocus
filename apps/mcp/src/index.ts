import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { assertApiConfiguredFromEnv, tools } from "@brainfocus/focusbrain-tools";

// Las herramientas viven en packages/focusbrain-tools (compartidas con apps/assistant);
// este archivo solo las expone por MCP/stdio para OpenClaw. Falla al arrancar, como antes,
// si falta la configuración de la API.
assertApiConfiguredFromEnv();

const server = new Server(
  { name: "brainfocus-api", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools[request.params.name as keyof typeof tools];
  if (!tool) {
    return { isError: true, content: [{ type: "text", text: `Tool desconocida: ${request.params.name}` }] };
  }

  const parsed = tool.argsSchema.safeParse(request.params.arguments ?? {});
  if (!parsed.success) {
    return { isError: true, content: [{ type: "text", text: `Argumentos inválidos: ${parsed.error.message}` }] };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (tool.handler as any)(parsed.data);
    // Un DELETE que responde 204 (sin body) hace que apiRequest devuelva
    // `undefined` — JSON.stringify(undefined) da el valor `undefined`, no el
    // string "undefined", así que el content block quedaba con `text:
    // undefined` (rompe el schema de MCP: text tiene que ser string). Bug
    // real confirmado 20-ago-2026: borrar_recordatorio (y borrar_aviso_asistente,
    // mismo patrón) le devolvían a Quicks un "error técnico" pese a que el
    // DELETE ya había salido bien en la API (verificado con 204 en los logs).
    return { content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
