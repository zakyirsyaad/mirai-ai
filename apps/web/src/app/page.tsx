import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/session";
import { SignIn } from "@/components/SignIn";

export const dynamic = "force-dynamic";

/**
 * Landing / sign-in. If already authenticated, jump to the dashboard. Otherwise
 * prompt the buyer to connect the SAME wallet they used to hire the agent on
 * CROO (wallet-as-identity — no link delivery needed).
 */
export default async function Home() {
  const session = await getActiveSession();
  if (session) redirect("/dashboard");

  return (
    <main className="container">
      <h1>mirai-ai</h1>
      <p className="muted">
        Autonomous X content agent. Hired on CROO; runs in your voice.
      </p>

      <div className="panel">
        <h2>Access your dashboard</h2>
        <p className="muted">
          Sign in with the wallet you used to hire the agent on CROO. We match
          your wallet to your paid order — that&apos;s your key, no link needed.
        </p>
        <SignIn />
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Haven&apos;t hired the agent yet? Find <strong>mirai-ai</strong> on the
        CROO Agent Store and order the 7-Day AI Content Agent, then come back
        here.
      </p>
    </main>
  );
}
