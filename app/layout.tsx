import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Bebas_Neue } from "next/font/google";
import "./globals.css";
import { WithdrawalIosBoot } from "@/components/withdrawal-ios-boot";

// Inter is the interface face (taken from betafrica.site's build — a variable
// font, so every weight the board uses ships in one file); Bebas Neue is the
// display face for the wordmark.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BetCono — Live Sports Betting & Casino",
  description:
    "Bet live on football and more, and cash out fast with mobile money on BetCono. Live odds, instant betslips, booking codes and daily boosted odds.",
  manifest: "/manifest.json",
  icons: { icon: "/logo-mark.svg", apple: "/logo-mark.svg" },
};

export const viewport: Viewport = {
  themeColor: "#4b0f14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bebas.variable}`} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/withdrawal-notification/withdrawal-notification.css" />
        {/* Applies the saved theme before first paint, so a dark-theme player
            never sees a white flash. White is the default. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
      </head>
      <body>
        {/* beforeInteractive puts the banner script in the first HTML response,
            so a completed withdrawal can call it immediately. */}
        <Script src="/withdrawal-notification/withdrawal-notification.js" strategy="beforeInteractive" />
        <WithdrawalIosBoot />
        {children}
      </body>
    </html>
  );
}
