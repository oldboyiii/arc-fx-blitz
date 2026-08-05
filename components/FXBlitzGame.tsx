"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { keccak256, encodePacked } from "viem";

// ============================================
// CONFIG: замени после деплоя через Remix
// ============================================
const CONTRACT_ADDRESS = "0x50e206F15556f06B374acDa943a7655602AF6494" as `0x${string}`;

const CONTRACT_ABI = [
  {
    inputs: [
      { name: "scoreBps", type: "uint256" },
      { name: "trades", type: "uint256" },
      { name: "bestTradeBps", type: "uint256" },
      { name: "proofHash", type: "bytes32" },
    ],
    name: "submitGame",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "count", type: "uint256" }],
    name: "getLeaderboard",
    outputs: [
      {
        components: [
          { name: "player", type: "address" },
          { name: "totalScoreBps", type: "uint256" },
          { name: "gamesPlayed", type: "uint256" },
          { name: "bestGameBps", type: "uint256" },
          { name: "lastPlayed", type: "uint256" },
        ],
        name: "entries",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalGamesPlayed",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

interface TradeLog {
  ts: number;
  dir: boolean;
  price: number;
}

interface LeaderboardEntry {
  player: string;
  totalScoreBps: bigint;
  gamesPlayed: bigint;
  bestGameBps: bigint;
  lastPlayed: bigint;
}

export default function FXBlitzGame() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending: isSubmitting, error: submitError } = useWriteContract();

  const [price, setPrice] = useState(1.0842);
  const [priceHistory, setPriceHistory] = useState<number[]>([1.0842]);
  const [timer, setTimer] = useState(30.0);
  const [running, setRunning] = useState(false);
  const [trades, setTrades] = useState(0);
  const [bestTrade, setBestTrade] = useState(0);
  const [totalPnl, setTotalPnl] = useState(0);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [position, setPosition] = useState<"buy" | "sell" | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [flash, setFlash] = useState<"green" | "red" | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceHistoryRef = useRef<number[]>([1.0842]);
  const tradeLogRef = useRef<TradeLog[]>([]);

  const { data: leaderboardData, refetch: refetchLeaderboard } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "getLeaderboard",
    args: [BigInt(5)],
    query: { enabled: CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" },
  });

  const { data: totalGames } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: "totalGamesPlayed",
    query: { enabled: CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000" },
  });

  const updatePrice = useCallback(() => {
    setPrice((prev) => {
      const next = Math.max(1.06, Math.min(1.12, prev + (Math.random() - 0.48) * 0.0008 + (Math.random() - 0.5) * 0.002));
      const newHistory = [...priceHistoryRef.current.slice(-119), next];
      priceHistoryRef.current = newHistory;
      setPriceHistory(newHistory);
      return next;
    });
  }, []);

  const startGame = () => {
    setPrice(1.0842);
    setPriceHistory([1.0842]);
    priceHistoryRef.current = [1.0842];
    setTimer(30.0);
    setTrades(0);
    setBestTrade(0);
    setTotalPnl(0);
    setEntryPrice(null);
    setPosition(null);
    setGameOver(false);
    setTxHash(null);
    setRunning(true);
    tradeLogRef.current = [];

    intervalRef.current = setInterval(() => {
      setTimer((t) => {
        const next = Math.max(0, parseFloat((t - 0.1).toFixed(1)));
        if (next <= 0) handleGameEnd();
        return next;
      });
      if (Math.random() > 0.25) updatePrice();
    }, 100);
  };

  const handleGameEnd = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
    setGameOver(true);
    setTimer(0);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const makeTrade = (type: "buy" | "sell") => {
    if (!running) return;
    setFlash(type === "buy" ? "green" : "red");
    setTimeout(() => setFlash(null), 150);
    setTrades((t) => t + 1);

    if (position && entryPrice !== null) {
      const raw = position === "buy" ? (price - entryPrice) / entryPrice : (entryPrice - price) / entryPrice;
      const bps = Math.floor(raw * 10000);
      setTotalPnl((p) => p + bps);
      setBestTrade((b) => (Math.abs(bps) > Math.abs(b) ? bps : b));
    }

    setPosition(type);
    setEntryPrice(price);
    tradeLogRef.current.push({ ts: Date.now(), dir: type === "buy", price });
  };

  const submitScore = () => {
    if (!isConnected || !address) return;

    const priceHistoryPacked = priceHistoryRef.current.map((p) => BigInt(Math.floor(p * 10000)));
    const tradeTimestampsPacked = tradeLogRef.current.map((t) => BigInt(t.ts));
    const tradeDirectionsPacked = tradeLogRef.current.map((t) => t.dir);

    const proofHash = keccak256(
      encodePacked(
        ["uint256", "uint256", "bytes32", "bytes32", "bytes32"],
        [
          BigInt(Math.max(0, totalPnl)),
          BigInt(trades),
          keccak256(encodePacked(["uint256[]"], [priceHistoryPacked])),
          keccak256(encodePacked(["uint256[]"], [tradeTimestampsPacked])),
          keccak256(encodePacked(["bool[]"], [tradeDirectionsPacked])),
        ]
      )
    );

    writeContract(
      {
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: "submitGame",
        args: [BigInt(Math.max(0, totalPnl)), BigInt(trades), BigInt(Math.abs(bestTrade)), proofHash],
      },
      {
        onSuccess: (hash) => {
          setTxHash(hash);
          refetchLeaderboard();
        },
      }
    );
  };

  const renderChart = () => {
    if (priceHistory.length < 2) return null;
    const w = 480;
    const h = 200;
    const min = Math.min(...priceHistory) * 0.9995;
    const max = Math.max(...priceHistory) * 1.0005;
    const range = max - min || 0.001;
    const points = priceHistory.map((p, i) => `${(i / 119) * w},${h - ((p - min) / range) * h}`);
    const isUp = priceHistory[priceHistory.length - 1] >= priceHistory[0];
    const color = isUp ? "#10b981" : "#ef4444";
    const [lastX, lastY] = points[points.length - 1].split(",");

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`${points.join(" ")} ${w},${h} 0,${h}`} fill="url(#chartGrad)" />
        <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="4" fill={color} stroke="#0a0e1a" strokeWidth="2" />
      </svg>
    );
  };

  const currentPnl = entryPrice !== null && position
    ? ((position === "buy" ? (price - entryPrice) / entryPrice : (entryPrice - price) / entryPrice) * 100)
    : 0;

  const isContractConfigured = CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="max-w-lg mx-auto bg-[#0a0e1a] border border-[#1e293b] rounded-xl overflow-hidden text-[#e2e8f0] font-sans shadow-2xl">
      <div className="flex justify-between items-center px-5 py-4 border-b border-[#1e293b] bg-[#111827]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[17px] font-medium text-white tracking-tight">Arc FX Blitz</h1>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-[#00d4aa] text-[#00d4aa] bg-[#00d4aa]/10 tracking-wider uppercase">Arc Testnet</span>
          </div>
          <p className="text-xs text-[#64748b] mt-1">USDC/EURC — Sub-second finality</p>
        </div>
        <div className={`text-[28px] font-medium tabular-nums leading-none ${timer < 5 && timer > 0 ? "text-red-500" : "text-[#00d4aa]"}`}>
          {timer.toFixed(1)}
        </div>
      </div>

      <div className="relative h-[200px] border-b border-[#1e293b] overflow-hidden">
        {flash && <div className={`absolute inset-0 z-10 pointer-events-none transition-opacity duration-150 ${flash === "green" ? "bg-green-500/[0.08]" : "bg-red-500/[0.08]"}`} />}
        {!running && !gameOver && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0e1a]/92 backdrop-blur-sm">
            <button onClick={startGame} className="flex items-center gap-2.5 bg-[#00d4aa] text-black px-9 py-3.5 rounded-[10px] font-medium text-[15px] hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(0,212,170,0.35)] active:scale-[0.98] transition-all duration-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7.76 3.1c.5 0 .98.13 1.41.39l10.36 6.12c1.32.78 1.76 2.48.98 3.8-.24.41-.58.75-.99 1l-10.36 6.11c-1.32.78-3.03.34-3.8-.98-.25-.43-.38-.92-.38-1.41V5.89c0-1.53 1.24-2.78 2.78-2.78z" /></svg>
              Start sprint
            </button>
            <p className="text-xs text-[#64748b] mt-3">30 seconds. Buy low, sell high. Gas: ~$0.005.</p>
            {totalGames !== undefined && <p className="text-[11px] text-[#475569] mt-1.5">{totalGames.toString()} games played on-chain</p>}
          </div>
        )}
        {gameOver && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0a0e1a]/92 backdrop-blur-sm">
            <div className={`text-[28px] font-medium mb-1 ${totalPnl >= 0 ? "text-[#00d4aa]" : "text-red-500"}`}>{totalPnl >= 0 ? "+" : ""}{(totalPnl / 100).toFixed(2)}%</div>
            <p className="text-sm text-[#64748b] mb-1">{trades} trades executed</p>
            <p className="text-xs text-[#475569] mb-4">Best: {bestTrade >= 0 ? "+" : ""}{(bestTrade / 100).toFixed(2)}%</p>
            {isConnected && isContractConfigured ? (
              <button onClick={submitScore} disabled={isSubmitting || !!txHash} className="bg-[#00d4aa] text-black px-7 py-2.5 rounded-[10px] font-medium text-sm hover:shadow-[0_0_20px_rgba(0,212,170,0.3)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {isSubmitting ? "Confirm in wallet..." : txHash ? "Submitted!" : "Submit to chain"}
              </button>
            ) : (
              <p className="text-xs text-[#64748b]">{!isConnected ? "Connect wallet to submit score" : "Configure contract address to submit"}</p>
            )}
            {submitError && <p className="text-xs text-red-400 mt-2 max-w-[280px] text-center">{submitError.message}</p>}
            {txHash && <a href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-[#00d4aa] mt-2 hover:underline">View on ArcScan →</a>}
            <button onClick={startGame} className="mt-4 text-sm text-[#00d4aa] hover:text-[#00f5c4] transition-colors">Play again</button>
          </div>
        )}
        <div className="absolute top-3 left-4 text-[30px] font-medium text-white tabular-nums z-[5]" style={{ textShadow: "0 0 20px rgba(0,212,170,0.25)" }}>{price.toFixed(4)}</div>
        <div className={`absolute top-3.5 right-4 text-[13px] font-medium px-2.5 py-1 rounded-md border tabular-nums z-[5] ${currentPnl >= 0 ? "text-[#00d4aa] border-[#00d4aa]/40 bg-[#00d4aa]/8" : "text-red-400 border-red-500/40 bg-red-500/8"}`}>
          {currentPnl >= 0 ? "+" : ""}{currentPnl.toFixed(2)}%
        </div>
        <div className="absolute inset-0 pt-10">{renderChart()}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-[#1e293b]">
        <button onClick={() => makeTrade("buy")} disabled={!running} className="flex items-center justify-center gap-2 py-3.5 rounded-[10px] border border-green-500/50 bg-green-500/[0.08] text-white font-medium text-[15px] hover:bg-green-500/[0.12] hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M11.39 2.36c.35-.35.92-.35 1.27 0l5.54 5.54c.35.35.35.92 0 1.27-.35.35-.92.35-1.27 0l-4-4V21c0 .5-.4.9-.9.9s-.9-.4-.9-.9V5.16l-4.04 4.02c-.35.35-.92.35-1.27 0-.35-.35-.35-.92 0-1.27l5.58-5.55z" /></svg>Buy
        </button>
        <button onClick={() => makeTrade("sell")} disabled={!running} className="flex items-center justify-center gap-2 py-3.5 rounded-[10px] border border-red-500/50 bg-red-500/[0.08] text-white font-medium text-[15px] hover:bg-red-500/[0.12] hover:shadow-[0_0_20px_rgba(239,68,68,0.15)] active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M11.39 21.64c.35.35.92.35 1.27 0l5.54-5.54c.35-.35.35-.92 0-1.27-.35-.35-.92-.35-1.27 0l-4 4V3c0-.5-.4-.9-.9-.9s-.9.4-.9.9v15.84l-4.04-4.02c-.35-.35-.92-.35-1.27 0-.35.35-.35.92 0 1.27l5.58 5.55z" /></svg>Sell
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-[#1e293b] bg-[#111827]">
        <div className="text-center"><div className="text-[11px] text-[#64748b] uppercase tracking-wider mb-1 font-medium">Trades</div><div className="text-base font-medium text-white tabular-nums">{trades}</div></div>
        <div className="text-center"><div className="text-[11px] text-[#64748b] uppercase tracking-wider mb-1 font-medium">Best trade</div><div className="text-base font-medium text-white tabular-nums">{bestTrade !== 0 ? `${bestTrade >= 0 ? "+" : ""}${(bestTrade / 100).toFixed(2)}%` : "—"}</div></div>
        <div className="text-center"><div className="text-[11px] text-[#64748b] uppercase tracking-wider mb-1 font-medium">Finality</div><div className="text-base font-medium text-[#00d4aa]">&lt;1s</div></div>
      </div>

      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#64748b]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 3.08c.55 0 1 .45 1 1v13.95h15l.1.01c.5.05.9.48.9 1s-.4.95-.9 1l-.1.01H4a2 2 0 01-2-2V4.08c0-.55.45-1 1-1z" /><path d="M18.26 6.52c.37-.41 1-.45 1.41-.08.42.37.45 1 .08 1.41l-3.88 4.33c-.71.79-1.92.89-2.75.22l-2.2-1.8-3.46 4.06c-.36.42-.99.47-1.41.11a1 1 0 01-.11-1.41l3.46-4.06c.71-.83 1.94-.94 2.79-.25l2.2 1.8 3.87-4.33z" /></svg>
            On-chain leaderboard
          </div>
          {isContractConfigured && <button onClick={() => refetchLeaderboard()} className="text-[11px] text-[#475569] hover:text-[#00d4aa] transition-colors">Refresh</button>}
        </div>
        <LeaderboardList data={leaderboardData} isConfigured={isContractConfigured} />
      </div>
    </div>
  );
}

function LeaderboardList({ data, isConfigured }: { data: LeaderboardEntry[] | undefined; isConfigured: boolean }) {
  const demo = [
    { rank: 1, player: "0x7a3...f2e1", score: 1240 },
    { rank: 2, player: "0x9b1...c4a2", score: 980 },
    { rank: 3, player: "0x3d5...e8b0", score: 720 },
    { rank: 4, player: "0xf2a...1c9d", score: 410 },
    { rank: 5, player: "0x1e4...a7f3", score: 230 },
  ];

  const entries = isConfigured && data && data.length > 0
    ? data.map((e, i) => ({ rank: i + 1, player: `${e.player.slice(0, 5)}...${e.player.slice(-4)}`, score: Number(e.totalScoreBps) }))
    : demo;

  return (
    <div>
      {entries.map((row) => (
        <div key={row.rank} className="flex justify-between items-center py-2 border-b border-[#1e293b]/60 last:border-0 text-sm">
          <span className={`w-6 text-center font-medium ${row.rank <= 3 ? "text-[#00d4aa]" : "text-[#64748b]"}`}>{row.rank}</span>
          <span className="flex-1 pl-2 text-[#e2e8f0] font-mono text-[13px]">{row.player}</span>
          <span className="font-medium text-[#00d4aa] tabular-nums text-[13px]">+{(row.score / 100).toFixed(1)}%</span>
        </div>
      ))}
      {!isConfigured && <p className="text-[11px] text-[#475569] mt-2 text-center">Demo data — configure contract to see live leaderboard</p>}
    </div>
  );
}
