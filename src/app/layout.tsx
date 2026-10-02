import type { Metadata } from "next";
import { Header } from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "tokens.do — the token leaderboard",
  description: "Global leaderboard of the biggest LLM token spenders. Sign in with X, connect OpenAI or Anthropic, get ranked.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="container footer">
          Usage is read from provider admin APIs and re-ranked daily at 00:00 UTC. Keys are encrypted at rest.
        </footer>
      </body>
    </html>
  );
}
