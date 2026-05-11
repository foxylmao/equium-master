"use client";

import { useEffect, useState } from "react";

const RELEASES_BASE =
  "https://github.com/HannaPrints/equium/releases/latest/download";

type Platform = "macos-arm64" | "macos-x64" | "windows" | "linux" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const plat = (navigator.platform || "").toLowerCase();
  if (ua.includes("windows") || plat.includes("win")) return "windows";
  if (ua.includes("mac") || plat.includes("mac")) {
    // No reliable arch sniff from UA; default to ARM for new Macs and
    // expose both buttons regardless.
    return "macos-arm64";
  }
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

export function DownloadButtons() {
  const [platform, setPlatform] = useState<Platform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  const primary: { label: string; href: string; tag: string } | null = (() => {
    switch (platform) {
      case "macos-arm64":
      case "macos-x64":
        return {
          label: "Download for macOS",
          tag: "Apple Silicon · .dmg",
          href: `${RELEASES_BASE}/Equium-Miner.dmg`,
        };
      case "windows":
        return {
          label: "Download for Windows",
          tag: "Windows 10/11 · .msi",
          href: `${RELEASES_BASE}/Equium-Miner.msi`,
        };
      case "linux":
        return {
          label: "Download for Linux",
          tag: "x86_64 · .AppImage",
          href: `${RELEASES_BASE}/Equium-Miner.AppImage`,
        };
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-5">
      {primary && (
        <a
          href={primary.href}
          className="block w-full rounded-3xl bg-[var(--color-rose)] text-white px-6 py-5 hover:bg-[#c97791] transition"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[20px] font-black tracking-[-0.01em]">
                {primary.label}
              </div>
              <div className="text-[13px] opacity-80 mt-1 font-mono">
                {primary.tag}
              </div>
            </div>
            <ArrowDown />
          </div>
        </a>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <PlatformLink
          label="macOS · Apple Silicon"
          file="Equium-Miner-aarch64.dmg"
        />
        <PlatformLink
          label="macOS · Intel"
          file="Equium-Miner-x64.dmg"
        />
        <PlatformLink label="Windows · x64" file="Equium-Miner.msi" />
        <PlatformLink label="Linux · AppImage" file="Equium-Miner.AppImage" />
      </div>

      <p className="text-[12px] font-mono text-[var(--color-fg-dim)] uppercase tracking-[0.15em]">
        All builds are open source · checksums on the release page
      </p>
    </div>
  );
}

function PlatformLink({ label, file }: { label: string; file: string }) {
  return (
    <a
      href={`${RELEASES_BASE}/${file}`}
      className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3 hover:border-[var(--color-rose)] transition"
    >
      <div className="text-[13px] font-semibold">{label}</div>
      <div className="text-[11px] font-mono text-[var(--color-fg-dim)] mt-0.5 truncate">
        {file}
      </div>
    </a>
  );
}

function ArrowDown() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4v16" />
      <path d="m6 14 6 6 6-6" />
    </svg>
  );
}
