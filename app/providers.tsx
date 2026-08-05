"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { useState, useEffect } from "react";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://arc-fx-blitz-six.vercel.app/api/rpc"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
};

const config = createConfig({
  chains: [arcTestnet],
  transports: { [arcTestnet.id]: http() },
  connectors: [injected()],
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [isFrame, setIsFrame] = useState(false);

  useEffect(() => {
    setIsFrame(window.self !== window.top);
  }, []);

  // В iframe Wagmi не используем — не оборачиваем в WagmiProvider
  if (isFrame) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
