import Link from "next/link";
import { ArrowLeft, Github, Terminal } from "lucide-react";
import { CodeBlock } from "@/components/code-block";
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

const flow = [
  "mirai_activate_license",
  "mirai_connect_x",
  "mirai_create_campaign",
  "mirai_set_voice_profile",
  "mirai_set_content_policy",
  "mirai_list_content_items",
  "mirai_update_content_item",
  "mirai_start_autopost",
  "mirai_get_campaign",
  "mirai_get_report",
];

const contentRevisionCommands = `/mirai content list
/mirai content edit <id> <revised text>
/mirai content delete <id>`;

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
          <div className="flex items-center gap-3">
            <Button variant="secondary" asChild>
              <a href={siteConfig.githubUrl} target="_blank" rel="noreferrer">
                <Github className="h-4 w-4" />
                GitHub
              </a>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Home
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <div className="max-w-3xl">
          <Badge>Install docs</Badge>
          <h1 className="mt-5 text-5xl font-semibold tracking-[-0.03em] text-balance">
            Install Mirai as a plugin.
          </h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Install the Mirai plugin/profile for Codex, Claude Code/CLI, or
            Hermes. Mirai still uses MCP under the hood, but users do not need
            to install the MCP package manually.
          </p>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-sm font-semibold">Codex plugin</div>
            <CodeBlock value={codexPluginInstall} />
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold">Claude Code/CLI plugin</div>
            <CodeBlock value={claudePluginInstall} />
          </div>
          <div>
            <div className="mb-3 text-sm font-semibold">Hermes plugin profile</div>
            <CodeBlock value={hermesPluginInstall} />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/70">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="secondary">Guided setup</Badge>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-balance">
              The client calls tools. Mirai owns the runtime.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Most users start with `/mirai setup &lt;license&gt;`. The plugin
              walks through activation, X OAuth, campaign brief, content policy,
              and the final approval gate.
            </p>
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
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              `mirai_set_content_policy` controls allowed topics, blocked topics,
              blocked phrases, language, tone rules, format rules, and
              approval-only subjects before any draft can be posted.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <Badge variant="outline">Content queue</Badge>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-balance">
            Revise user-supplied content before Mirai uses it.
          </h2>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            In user-supplied mode, buyers can inspect queued content, revise
            pending items, or remove them before a scheduled slot claims the
            item. Once an item has been used by the posting pipeline, it is
            locked so the campaign report stays consistent.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-3 text-sm font-semibold">Queue commands</div>
          <CodeBlock value={contentRevisionCommands} />
          <div className="mt-5 grid gap-3 text-sm text-muted-foreground">
            <div className="rounded-md bg-background p-3">
              `PENDING` items can be edited or deleted.
            </div>
            <div className="rounded-md bg-background p-3">
              `USED` items are locked after Mirai claims them for a post slot.
            </div>
            <div className="rounded-md bg-background p-3">
              Hosted API mirrors the commands with `GET /mcp/content`, `PATCH
              /mcp/content/:id`, and `DELETE /mcp/content/:id`.
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Badge variant="secondary">FYP-inspired ranking</Badge>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-balance">
              Mirai adapts the public X algorithm shape for autonomous content.
            </h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              The recommendation layer is inspired by the open-source{" "}
              <a
                className="font-medium text-foreground underline underline-offset-4"
                href="https://github.com/xai-org/x-algorithm"
                target="_blank"
                rel="noreferrer"
              >
                xai-org/x-algorithm
              </a>{" "}
              repository. Mirai does not run X&apos;s production ranking system;
              it uses the same retrieval, ranking, filtering, and selection
              pattern for a transparent CROO content agent.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground">
            {[
              "ACQUIRE gathers owned X signals from timeline, own tweets, and trends.",
              "The recommendation engine ranks signals by freshness, topical match, engagement quality, and campaign history.",
              "COMPOSE generates five variants, then the draft tournament selects the safest and strongest candidate.",
              "RECORD stores engagement metrics so future slots can prefer angles that already performed well.",
            ].map((item) => (
              <div key={item} className="rounded-md border border-border bg-background p-4">
                {item}
              </div>
            ))}
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
              Normal users should not edit MCP config manually. For staging or
              VPS testing only, use the advanced runtime config generator to
              override `MIRAI_API_URL`. Production should point to
              `https://api.mirai-agent.com` once the domain is ready.
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
