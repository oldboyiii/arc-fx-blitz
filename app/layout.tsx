import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Arc FX Blitz — 30s Trading Sprint",
  description: "First gamified FX trading on Arc Network. USDC-native gas, sub-second finality.",
  openGraph: {
    title: "Arc FX Blitz",
    description: "30-second USDC/EURC trading sprint on Arc Network",
    images: ["/og.svg"],
  },
  other: {
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: "https://arc-fx-blitz-six.vercel.app/og.svg",
      button: {
        title: "🚀 Start Trading",
        action: {
          type: "launch_frame",
          name: "Arc FX Blitz",
          url: "https://arc-fx-blitz-six.vercel.app",
          splashImageUrl: "https://arc-fx-blitz-six.vercel.app/og.svg",
          splashBackgroundColor: "#0a0e1a",
        },
      },
    }),
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
