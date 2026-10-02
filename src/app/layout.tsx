import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700", "800"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "tokens.do",
  description: "Global leaderboard of the biggest LLM token spenders.",
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
