"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount, useWriteContract, useReadContract, useConnect, useDisconnect } from "wagmi";
import { keccak256, encodePacked } from "viem";
import { injected } from "wagmi/connectors";

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
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
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
            <h1 className="text-[17px] font-medium text-white tracking-tight">Arc FX Blitz
