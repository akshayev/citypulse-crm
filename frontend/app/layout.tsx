import type { Metadata } from "next";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "CityPulse CRM — AI-Powered Lead Management",
  description:
    "Zero-cost, event-driven CRM with automated lead generation, AI scoring, and real-time Kanban pipeline management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. webcrx, Grammarly)
    // inject attributes onto <html>/<body> before React hydrates, which would
    // otherwise log a hydration mismatch. This only ignores attribute diffs on
    // these two elements — real mismatches deeper in the tree still surface.
    <html
      lang="en"
      className="h-full antialiased font-sans"
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col"
        suppressHydrationWarning
      >
        <QueryProvider>{children}</QueryProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
