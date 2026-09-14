"use client";

import { Copy, CopyCheck, Mail, Phone, Search, TriangleAlert } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ActionKind, Tier } from "@/lib/types";

export function NextActionIcon({ kind, className }: { kind: ActionKind; className?: string }) {
  switch (kind) {
    case "email":
      return <Mail className={className} />;
    case "call":
      return <Phone className={className} />;
    case "manual":
      return <TriangleAlert className={className} />;
    default:
      return <Search className={className} />;
  }
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const TIER_STYLE: Record<Tier, { label: string; badge: string; color: string; text: string; bar: string }> = {
  A: {
    label: "Priority",
    badge: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
    color: "#34d399",
    text: "text-emerald-300",
    bar: "bg-emerald-400",
  },
  B: {
    label: "Strong",
    badge: "bg-gold-400/10 text-gold-300 ring-gold-400/30",
    color: "#ecc85f",
    text: "text-gold-300",
    bar: "bg-gold-400",
  },
  C: {
    label: "Nurture",
    badge: "bg-sky-400/10 text-sky-300 ring-sky-400/25",
    color: "#7dd3fc",
    text: "text-sky-300",
    bar: "bg-sky-400",
  },
  D: {
    label: "Low fit",
    badge: "bg-ink-700/50 text-ink-300 ring-ink-600",
    color: "#6b6b7a",
    text: "text-ink-400",
    bar: "bg-ink-500",
  },
};

export function TierBadge({ tier, className }: { tier: Tier; className?: string }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        s.badge,
        className,
      )}
    >
      {tier}
      <span className="font-medium opacity-80">· {s.label}</span>
    </span>
  );
}

export function ScoreRing({ value, tier, size = 44, stroke = 4 }: { value: number; tier: Tier; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Score ${value} of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" className="stroke-ink-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={TIER_STYLE[tier].color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-semibold tabular-nums text-ink-100"
        style={{ fontSize: size * 0.3 }}
      >
        {value}
      </span>
    </div>
  );
}

const VARIANTS = {
  primary:
    "bg-gold-400 text-ink-950 hover:bg-gold-300 shadow-[0_0_0_1px_rgba(236,200,95,0.35),0_10px_28px_-10px_rgba(236,200,95,0.55)]",
  secondary: "bg-ink-800 text-ink-100 ring-1 ring-inset ring-ink-700 hover:bg-ink-750 hover:ring-ink-600",
  ghost: "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
  danger: "text-rose-300 hover:bg-rose-500/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400",
        "disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
        size === "sm" ? "h-8 px-2.5 text-xs [&_svg]:size-3.5" : "h-9 px-3.5 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Panel({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-ink-800 bg-ink-900/80 backdrop-blur-sm", className)}>
      <header className="flex items-start gap-2.5 border-b border-ink-800 px-4 py-3">
        {icon && <span className="mt-0.5 text-gold-400 [&>svg]:size-4">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold tracking-tight text-ink-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-ink-400">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300 ring-1 ring-inset ring-ink-700",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Favicon({ domain, size = 20 }: { domain: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-md bg-ink-700 text-[10px] font-semibold uppercase text-ink-200"
        style={{ width: size, height: size }}
      >
        {domain[0]}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-md bg-ink-800 p-0.5 ring-1 ring-ink-700"
      style={{ width: size, height: size }}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-ink-950/70 p-0.5 ring-1 ring-inset ring-ink-700", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors [&_svg]:size-3.5",
            value === o.value ? "bg-ink-700 text-ink-100 shadow-sm" : "text-ink-400 hover:text-ink-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard can be blocked in insecure contexts; the text is still selectable.
        }
      }}
    >
      {copied ? <CopyCheck /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 outline-none transition focus:border-gold-500/70 focus:ring-2 focus:ring-gold-400/15";
