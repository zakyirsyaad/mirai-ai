import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  Code2,
  Github,
  KeyRound,
  LockKeyhole,
  ListFilter,
  ServerCog,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { CrooCta } from "@/components/croo-cta";
import { HeroConsole } from "@/components/hero-console";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/lib/site";

const clients = ["Codex", "Claude Code/CLI", "Hermes"];

const steps = [
  ["Buy on CROO", "Choose a Mirai service and receive a signed access license."],
  ["Install plugin", "Add the Mirai plugin/profile for your client."],
  ["Connect X", "OAuth tokens stay encrypted in the hosted worker runtime."],
  ["Approve once", "Mirai plans and runs the campaign until license expiry."],
];

export default function HomePage() {
  return (
    <main>
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3 font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            M
          </span>
          Mirai
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <Link className="hover:text-foreground" href="#services">
            Services
          </Link>
          <Link className="hover:text-foreground" href="#how">
            How it works
          </Link>
          <Link className="hover:text-foreground" href="/docs">
            Docs
          </Link>
          <a
            className="inline-flex items-center gap-2 hover:text-foreground"
            href={siteConfig.githubUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:py-20">
        <div>
          <Badge>Available through CROO Marketplace</Badge>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl">
            Mirai is a plugin-first agent for autonomous X campaigns.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Buy once on CROO, activate a signed license, connect X, and let
            Mirai run a 7-day, 14-post campaign from Codex, Claude Code/CLI,
            or Hermes.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <CrooCta size="lg" />
            <Button size="lg" variant="secondary" asChild>
              <Link href="/docs">
                Read install docs
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <a href={siteConfig.githubUrl} target="_blank" rel="noreferrer">
                <Github className="h-4 w-4" />
                GitHub repo
              </a>
            </Button>
          </div>
          <p className="mt-4 max-w-xl text-sm text-muted-foreground">
            No dashboard account. No local worker. The hosted Mirai runtime
            handles scheduling, expiry checks, posting, and reports.
          </p>
        </div>
        <HeroConsole />
      </section>

      <section id="services" className="border-y border-border bg-card/70">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-3xl">
            <Badge variant="secondary">CROO services</Badge>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-balance">
              Two focused services. One plugin-first runtime.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="bg-background">
              <CardHeader>
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-primary/20 text-accent-foreground">
                  <Bot className="h-5 w-5" />
                </div>
                <CardTitle>Mirai 7-Day Autopost</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="max-w-2xl text-muted-foreground">
                  A signed access pass for a 7-day campaign with 14 planned
                  posts, autonomous or user-supplied content, approval once, and
                  automatic stop at expiry.
                </p>
                <ul className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    "14 scheduled posts",
                    "Hosted worker and scheduler",
                    "Queued content revisions",
                    "FYP-inspired signal ranking",
                    "Campaign content policy",
                    "X OAuth token encryption",
                    "Proof-of-work report",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-accent-foreground" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-background">
              <CardHeader>
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-md bg-primary/20 text-accent-foreground">
                  <Sparkles className="h-5 w-5" />
                </div>
                <CardTitle>Mirai Voice & Ideas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  A read-only service for voice profiling and 10 content ideas.
                  It cannot post to X.
                </p>
                <div className="mt-6 rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
                  Best for buyers who want strategy and content direction before
                  committing to an autopost campaign.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Badge variant="outline">Buyer flow</Badge>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-balance">
              CROO handles the order. Mirai handles the work.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {steps.map(([title, text], index) => (
              <div
                key={title}
                className="rounded-lg border border-border bg-card p-5"
              >
                <span className="font-mono text-sm text-accent-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-black text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
          <div>
            <Badge variant="outline" className="border-white/20 text-white">
              Plugin-native
            </Badge>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.02em] text-balance">
              Built for the agent clients people already use.
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">
              Mirai ships as client plugins and profiles. MCP stays underneath
              as the runtime protocol, not as manual buyer setup.
            </p>
          </div>
          <div className="grid gap-3">
            {clients.map((client) => (
              <div
                key={client}
                className="flex items-center justify-between border-b border-white/15 py-4"
              >
                <span className="text-lg">{client}</span>
                <Code2 className="h-5 w-5 text-primary" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            [KeyRound, "Signed licenses", "Ed25519 keys verify service, scopes, limits, and expiry."],
            [ServerCog, "Hosted worker", "Users do not manage Postgres, Redis, Docker, or schedulers."],
            [ListFilter, "FYP-inspired ranking", "Owned X signals are ranked by freshness, topic fit, quality, and learned campaign performance."],
            [ShieldCheck, "Expiry enforcement", "Sensitive actions check entitlement before posting or resuming."],
          ].map(([Icon, title, text]) => {
            const TrustIcon = Icon as typeof KeyRound;
            return (
              <div key={title as string} className="rounded-lg border border-border p-5">
                <TrustIcon className="h-5 w-5 text-accent-foreground" />
                <h3 className="mt-5 text-lg font-semibold">{title as string}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {text as string}
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-12 rounded-lg border border-border bg-card p-6 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Ready when the CROO listing is live.</h2>
            <p className="mt-2 text-muted-foreground">
              The site will point to the marketplace URL as soon as it is available.
            </p>
          </div>
          <CrooCta className="mt-5 sm:mt-0" />
        </div>
      </section>
    </main>
  );
}
