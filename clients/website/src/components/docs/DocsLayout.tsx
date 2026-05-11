"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

interface NavItem {
  href: string;
  label: string;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Start here",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/getting-started", label: "Getting started" },
    ],
  },
  {
    title: "Reference",
    items: [
      { href: "/docs/protocol", label: "Protocol" },
      { href: "/docs/tokenomics", label: "Tokenomics" },
      { href: "/docs/rpc", label: "RPC setup" },
    ],
  },
];

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main>
      <Navbar />
      <div className="pt-28 pb-16 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-10">
          {/* Sidebar */}
          <aside className="md:w-56 md:flex-shrink-0">
            <div className="md:sticky md:top-28">
              {SECTIONS.map((section) => (
                <div key={section.title} className="mb-7">
                  <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--color-fg-dim)] mb-3 font-semibold px-3">
                    {section.title}
                  </div>
                  <nav className="flex flex-col gap-0.5">
                    {section.items.map((item) => {
                      const active = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`px-3 py-1.5 rounded-lg text-[13.5px] transition-colors ${
                            active
                              ? "bg-[var(--color-rose-soft)]/20 text-[var(--color-rose)] font-semibold"
                              : "text-[var(--color-fg-soft)] hover:text-[var(--color-fg)] hover:bg-white/[0.03]"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 min-w-0 max-w-3xl">
            <article className="prose-doc">{children}</article>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
