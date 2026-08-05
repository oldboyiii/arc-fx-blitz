import dynamic from "next/dynamic";

const FXBlitzGame = dynamic(() => import("@/components/FXBlitzGame"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
      <div className="text-[#00d4aa] text-lg animate-pulse">Loading Arc FX Blitz...</div>
    </div>
  ),
});

export default function Home() {
  return <FXBlitzGame />;
}
