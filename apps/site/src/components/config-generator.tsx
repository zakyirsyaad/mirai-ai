"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildMcpConfig,
  clientLabels,
  siteConfig,
  type McpClient,
} from "@/lib/site";

const clients: McpClient[] = ["cursor", "claude", "codex", "hermes", "json"];

export function ConfigGenerator() {
  const [client, setClient] = useState<McpClient>("cursor");
  const [apiUrl, setApiUrl] = useState(siteConfig.defaultApiUrl);
  const reducedMotion = useReducedMotion();
  const config = useMemo(() => buildMcpConfig(client, apiUrl), [apiUrl, client]);

  return (
    <div
      id="mcp-config-generator"
      className="rounded-lg border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Badge>Interactive generator</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-normal text-balance">
            Generate the MCP config for your client.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Hosted mode is the default. Keep the endpoint as-is for production,
            or override it when testing a staging API on a VPS IP.
          </p>
        </div>
        <label className="grid min-w-0 gap-2 text-sm font-medium md:w-80">
          <span>Hosted API endpoint</span>
          <input
            value={apiUrl}
            onChange={(event) => setApiUrl(event.target.value)}
            className="h-11 rounded-md border border-input bg-background px-3 font-mono text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <Tabs
        value={client}
        onValueChange={(value) => setClient(value as McpClient)}
        className="mt-6"
      >
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {clients.map((item) => (
            <TabsTrigger key={item} value={item}>
              {clientLabels[item]}
            </TabsTrigger>
          ))}
        </TabsList>
        {clients.map((item) => (
          <TabsContent key={item} value={item}>
            <motion.div
              key={`${item}-${apiUrl}`}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <CodeBlock value={config} />
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
