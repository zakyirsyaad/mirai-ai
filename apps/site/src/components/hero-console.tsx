"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Clock3, KeyRound, Radio, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const events = [
  {
    icon: KeyRound,
    label: "License verified",
    detail: "mirai_v1 payload signed with Ed25519",
  },
  {
    icon: Radio,
    label: "X account connected",
    detail: "tokens encrypted on the hosted worker",
  },
  {
    icon: Clock3,
    label: "14 post slots planned",
    detail: "7-day schedule, approval once",
  },
  {
    icon: ShieldCheck,
    label: "Expiry guard active",
    detail: "posting stops when entitlement closes",
  },
];

const slots = Array.from({ length: 14 }, (_, index) => index + 1);

export function HeroConsole() {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      aria-label="Mirai agent console preview"
      initial={reducedMotion ? false : { y: 18 }}
      animate={reducedMotion ? undefined : { y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-lg border border-border bg-card shadow-designbyte"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
        </div>
        <Badge variant="outline">hosted MCP</Badge>
      </div>

      <div className="grid gap-6 p-5 sm:p-6">
        <div className="rounded-md bg-black p-4 font-mono text-sm text-white">
          <p className="text-primary">$ mirai_activate_license</p>
          <p className="mt-2 text-white/80">
            ok: content-agent-7d · expires in 7 days
          </p>
          <p className="mt-3 text-primary">$ mirai_start_autopost --approved</p>
          <p className="mt-2 text-white/80">
            scheduled: 14 posts · worker: vps · mode: autonomous
          </p>
        </div>

        <div className="grid gap-3">
          {events.map((event, index) => {
            const Icon = event.icon;
            return (
              <motion.div
                key={event.label}
                initial={reducedMotion ? false : { x: 14 }}
                animate={reducedMotion ? undefined : { x: 0 }}
                transition={{
                  delay: 0.18 + index * 0.09,
                  duration: 0.5,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="flex gap-3 rounded-md border border-border bg-background p-3"
              >
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-accent-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{event.label}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {event.detail}
                  </span>
                </span>
              </motion.div>
            );
          })}
        </div>

        <div className="grid grid-cols-7 gap-2" aria-label="14 scheduled post slots">
          {slots.map((slot) => (
            <span
              key={slot}
              className={cn(
                "flex aspect-square items-center justify-center rounded-sm border text-xs font-semibold",
                slot <= 3
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {slot <= 3 ? <CheckCircle2 className="h-3.5 w-3.5" /> : slot}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
