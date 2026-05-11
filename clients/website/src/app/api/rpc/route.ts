// Server-side Solana RPC proxy. The real RPC URL is held in a server-only env
// var (NEVER exposed to the client) and forwarded JSON-RPC bodies are
// relayed through here. Browser clients hit /api/rpc without ever learning
// the upstream URL, which lets us host browser miners on our paid Helius
// quota without leaking the API key.
//
// Hard limits (per IP, in-memory) keep one user from burning the whole quota.

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.HELIUS_RPC_URL ||
  process.env.NEXT_PUBLIC_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

// Allowed JSON-RPC methods the proxy will forward. Anything else returns 403.
// This is the union of what the browser miner + explorer need.
const ALLOWED_METHODS = new Set<string>([
  "getAccountInfo",
  "getBalance",
  "getBlockHeight",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getRecentBlockhash",
  "getRecentPrioritizationFees",
  "getSignaturesForAddress",
  "getSignatureStatuses",
  "getSlot",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getTransaction",
  "getVersion",
  "isBlockhashValid",
  "sendTransaction",
  "simulateTransaction",
]);

// Rate limiter: simple sliding-window counter per IP. Production should use
// Redis/Upstash; this in-memory map is fine for a single Vercel instance.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQS = 120; // per IP per minute
const ipBuckets = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = ipBuckets.get(ip) || [];
  // Drop entries older than the window
  const fresh = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX_REQS) {
    ipBuckets.set(ip, fresh);
    return false;
  }
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  return true;
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "rate limit exceeded", retry_after_sec: 60 },
      { status: 429 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // Single request or batch
  const requests = Array.isArray(body) ? body : [body];
  for (const r of requests) {
    if (!r || typeof r !== "object" || typeof r.method !== "string") {
      return NextResponse.json(
        { error: "invalid JSON-RPC envelope" },
        { status: 400 }
      );
    }
    if (!ALLOWED_METHODS.has(r.method)) {
      return NextResponse.json(
        { error: `method "${r.method}" is not allowed`, allowed: [...ALLOWED_METHODS] },
        { status: 403 }
      );
    }
  }

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") || "application/json",
        // Allow CORS for client requests from same origin only (Next handles
        // cross-origin via the host header; this is mostly belt-and-braces)
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "upstream failure", detail: String(e?.message ?? e) },
      { status: 502 }
    );
  }
}
