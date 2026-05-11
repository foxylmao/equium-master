import React from "react";

export function DocTitle({
  kicker,
  title,
  lede,
}: {
  kicker?: string;
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-10">
      {kicker && (
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--color-rose)] mb-3 font-semibold">
          {kicker}
        </div>
      )}
      <h1 className="text-[36px] md:text-[44px] font-black tracking-[-0.025em] leading-[1.1] mb-4">
        {title}
      </h1>
      {lede && (
        <p className="text-[17px] leading-[1.6] text-[var(--color-fg-dim)] max-w-2xl">
          {lede}
        </p>
      )}
    </header>
  );
}

export function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="text-[24px] font-bold tracking-[-0.018em] mt-12 mb-4 scroll-mt-32"
    >
      {children}
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[17px] font-bold tracking-[-0.01em] mt-8 mb-3">
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-[1.7] text-[var(--color-fg-soft)] mb-4">
      {children}
    </p>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="text-[15px] leading-[1.7] text-[var(--color-fg-soft)] mb-4 pl-5 space-y-1.5 list-disc marker:text-[var(--color-fg-dim)]">
      {children}
    </ul>
  );
}

export function OL({ children }: { children: React.ReactNode }) {
  return (
    <ol className="text-[15px] leading-[1.7] text-[var(--color-fg-soft)] mb-4 pl-5 space-y-2 list-decimal marker:text-[var(--color-fg-dim)] marker:font-mono marker:text-[13px]">
      {children}
    </ol>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[13px] px-1.5 py-0.5 rounded bg-[var(--color-bg-elev)] border border-[var(--color-border)] text-[var(--color-teal)]">
      {children}
    </code>
  );
}

export function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 mb-5 overflow-x-auto font-mono text-[12.5px] leading-[1.7] text-[var(--color-fg-soft)]">
      {children}
    </pre>
  );
}

export function Callout({
  tone = "default",
  title,
  children,
}: {
  tone?: "default" | "warn" | "info";
  title?: string;
  children: React.ReactNode;
}) {
  const border =
    tone === "warn"
      ? "border-[var(--color-gold)]/40 bg-[var(--color-gold)]/[0.06]"
      : tone === "info"
        ? "border-[var(--color-teal)]/40 bg-[var(--color-teal)]/[0.04]"
        : "border-[var(--color-border-bright)] bg-[var(--color-bg-elev)]";
  return (
    <div className={`rounded-2xl border p-5 my-6 ${border}`}>
      {title && (
        <div className="text-[13px] font-bold tracking-[-0.01em] mb-1.5">
          {title}
        </div>
      )}
      <div className="text-[14px] leading-[1.65] text-[var(--color-fg-dim)]">
        {children}
      </div>
    </div>
  );
}

export function Table({
  columns,
  rows,
}: {
  columns: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="my-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] overflow-hidden">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="text-left border-b border-[var(--color-border)]">
            {columns.map((c) => (
              <th
                key={c}
                className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.15em] text-[var(--color-fg-dim)] font-semibold"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[var(--color-border)] last:border-b-0"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-[var(--color-fg-soft)]">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
