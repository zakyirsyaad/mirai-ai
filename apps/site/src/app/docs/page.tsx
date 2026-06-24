import Link from "next/link";
import { ArrowLeft, Terminal } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
import { ConfigGenerator } from "@/components/config-generator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { siteConfig } from "@/lib/site";

const codexPluginInstall = `codex plugin marketplace add zakyirsyaad/mirai-ai --ref main --sparse .agents --sparse plugins/mirai-codex
codex plugin add mirai-codex@mirai-ai`;
const claudePluginInstall = `claude plugin marketplace add zakyirsyaad/mirai-ai --sparse .claude-plugin plugins/mirai-claude
claude plugin install mirai-claude@mirai-ai`;
const hermesPluginInstall = `hermes plugins install zakyirsyaad/mirai-ai --enable
hermes mcp add mirai --command npx --env MIRAI_API_URL=${siteConfig.defaultApiUrl} --args -y ${siteConfig.packageName}@latest mcp`;
const cursorProfileInstall = `Copy from the Mirai repo:
.cursor/mcp.json
.cursor/rules/mirai.mdc`;

const flow = [
  "mirai_activate_license",
  "mirai_connect_x",
  "mirai_create_campaign",
  "mirai_set_voice_profile",
  "mirai_start_autopost",
  "mirai_get_campaign",
  "mirai_get_report",
];

export default function DocsPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-background/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              M
            </span>
            Mirai
          </Link>
          <Button variant="secondary" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Home
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="max-w-3xl">
          <Badge>Install docs</Badge>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.03em] text-balance">
            Install Mirai as a plugin.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Use the plugin/profile for your client. Mirai still uses MCP under
            the hood, but users do not need to install or configure the MCP
            package manually.
          </p>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-semibold">Codex plugin</div>
            <CodeBlock value={codexPluginInstall} />
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold">Claude Code plugin</div>
            <CodeBlock value={claudePluginInstall} />
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold">Hermes plugin profile</div>
            <CodeBlock value={hermesPluginInstall} />
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold">Cursor profile</div>
            <CodeBlock value={cursorProfileInstall} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <ConfigGenerator />
      </section>

      <section className="border-y border-border bg-card/70">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="secondary">Tool order</Badge>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-balance">
              The client calls tools. Mirai owns the runtime.
            </h2>
          </div>
          <div className="rounded-lg border border-border bg-background p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Terminal className="h-4 w-4 text-accent-foreground" />
              Autopost campaign flow
            </div>
            <div className="grid gap-2">
              {flow.map((tool, index) => (
                <div
                  key={tool}
                  className="flex items-center justify-between rounded-md bg-muted px-3 py-2 font-mono text-sm"
                >
                  <span>{tool}</span>
                  <span className="text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-16 sm:px-8">
        <Badge variant="outline">Troubleshooting</Badge>
        <Accordion type="single" collapsible className="mt-5">
          <AccordionItem value="license">
            <AccordionTrigger>Mirai says the license is missing.</AccordionTrigger>
            <AccordionContent>
              Call `mirai_activate_license` with the signed license delivered
              after the CROO order. The plugin runtime stores it for future
              Mirai tool calls.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="hosted">
            <AccordionTrigger>Do users need Docker or Redis?</AccordionTrigger>
            <AccordionContent>
              No. Hosted mode is the default. The VPS-hosted Mirai worker owns
              Postgres, Redis, scheduling, posting, and report generation.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="api">
            <AccordionTrigger>The hosted API is unavailable.</AccordionTrigger>
            <AccordionContent>
              Override the API URL in the config generator for staging. Production
              should point to `https://api.mirai-agent.com` once the domain is
              ready.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="expired">
            <AccordionTrigger>What happens after expiry?</AccordionTrigger>
            <AccordionContent>
              Posting stops automatically. Sensitive actions such as start,
              resume, post, and deliver check entitlement status before running.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </main>
  );
}
