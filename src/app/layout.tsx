import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-mono" });

const description = "Global leaderboard of the biggest LLM token spenders. Sign in with X and get ranked.";

export const metadata: Metadata = {
  metadataBase: new URL("https://tokens.do"),
  title: "tokens.do",
  description,
  // Shared rank posts link here; these make X render a card instead of a bare URL.
  openGraph: { title: "tokens.do: who burns the most tokens?", description, url: "/", siteName: "tokens.do", type: "website" },
  twitter: { card: "summary", title: "tokens.do: who burns the most tokens?", description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>
        <Header />
        <main className="container">{children}</main>
        <footer className="footer">
          <div className="container bar">
            <span>re-ranked daily 00:00 utc · keys encrypted at rest</span>
            <span>
              powered by{" "}
              <a href="https://code.in" target="_blank" rel="noopener noreferrer">
                code.in
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
