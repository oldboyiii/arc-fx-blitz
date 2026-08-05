"use client";

import { useState, useEffect, useMemo } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { injected } from "wagmi/connectors";

const arcTestnet = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://arc-fx-blitz-six.vercel.app/api/rpc"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
};

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  const [isFrame, setIsFrame] = useState(true);

  useEffect(() => {
    setIsFrame(typeof window !== "undefined" && window.self !== window.top);
  }, []);

  const config = useMemo(() => {
    if (isFrame) return null;
    return createConfig({
      chains: [arcTestnet],
      transports: { [arcTestnet.id]: http() },
      connectors: [injected({ target: "metaMask" })],
      storage: null,
    });
  }, [isFrame]);

  if (isFrame || !config) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
