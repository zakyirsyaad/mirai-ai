import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteConfig } from "@/lib/site";

export function CrooCta({
  size = "default",
  className,
}: {
  size?: "default" | "lg";
  className?: string;
}) {
  if (!siteConfig.crooUrl) {
    return (
      <Button size={size} disabled className={className}>
        <LockKeyhole className="h-4 w-4" />
        Coming soon on CROO
      </Button>
    );
  }

  return (
    <Button size={size} asChild className={className}>
      <Link href={siteConfig.crooUrl} target="_blank" rel="noreferrer">
        Buy on CROO
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Button>
  );
}
