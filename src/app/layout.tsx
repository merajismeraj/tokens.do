import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "tokens.do — the token leaderboard",
  description: "Global leaderboard of the biggest LLM token spenders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="container footer">
          Re-ranked daily 00:00 UTC · keys encrypted at rest
        </footer>
      </body>
    </html>
  );
}
