"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { useMemo } from "react";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://arc-fx-blitz-six.vercel.app/api/rpc"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
};

function getIsFrame() {
  if (typeof window === "undefined") return false;
  return window.self !== window.top;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const isFrame = getIsFrame();

  const config = useMemo(() => {
    return createConfig({
      chains: [arcTestnet],
      transports: { [arcTestnet.id]: http() },
      connectors: isFrame ? [] : [injected()],
    });
  }, [isFrame]);

  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
