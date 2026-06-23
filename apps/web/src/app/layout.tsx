import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mirai-ai — Autonomous X content agent",
  description:
    "Hire mirai-ai on CROO. It generates and posts in your voice, on schedule.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
