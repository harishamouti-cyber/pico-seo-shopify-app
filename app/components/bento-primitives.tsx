import type { ReactNode } from "react";
import { scoreTone } from "../lib/seo-score";
import { ExternalArrowIcon, ImageFrameIcon, ShieldCheckIcon } from "./icons";

export function LiveStatusDot({
  tone = "live",
}: {
  tone?: "live" | "amber" | "muted";
}) {
  return <span className={`pico-status-dot pico-status-dot--${tone}`} />;
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <span className={`pico-pill pico-pill--${tone} pico-tabular`}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background:
            tone === "success"
              ? "#10b981"
              : tone === "warning"
                ? "#f59e0b"
                : "#ef4444",
        }}
      />
      {score} / 100
    </span>
  );
}

export function RadialScoreGauge({
  score,
  size = 168,
}: {
  score: number;
  size?: number;
}) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference - (clamped / 100) * circumference;
  const color =
    clamped >= 80 ? "#10b981" : clamped >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto",
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <span
          className="pico-tabular"
          style={{
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            color: "#0f172a",
          }}
        >
          {clamped}
        </span>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "#64748b",
            marginTop: 2,
          }}
        >
          Readiness score
        </span>
      </div>
    </div>
  );
}

export function ProductThumbnail({
  src,
  alt,
  large = false,
}: {
  src: string | null | undefined;
  alt: string;
  large?: boolean;
}) {
  return (
    <div className={`pico-thumb ${large ? "pico-thumb--lg" : ""}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <ImageFrameIcon size={large ? 24 : 18} style={{ color: "#94a3b8" }} />
      )}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

export function SpringSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="pico-segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`pico-segmented-btn ${active ? "pico-segmented-btn--active" : ""}`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const PARTNER_APPS = [
  {
    name: "RestockPing",
    tagline: "Instant back-in-stock SMS & email alerts that recover lost demand.",
    badge: "Inventory recovery",
    href: "https://apps.shopify.com/search?q=RestockPing",
  },
  {
    name: "DropClock",
    tagline: "High-converting product drop countdowns and hype launch timers.",
    badge: "Launch urgency",
    href: "https://apps.shopify.com/search?q=DropClock",
  },
  {
    name: "CartLock",
    tagline: "Reserve in-cart inventory & prevent checkout sniping during flash sales.",
    badge: "Cart protection",
    href: "https://apps.shopify.com/search?q=CartLock",
  },
  {
    name: "PromoLint",
    tagline: "Audit discount codes & prevent accidental margin-stacking leaks.",
    badge: "Margin guard",
    href: "https://apps.shopify.com/search?q=PromoLint",
  },
  {
    name: "PrepaidFlip",
    tagline: "Convert COD orders into prepaid payments with instant incentives.",
    badge: "Cashflow boost",
    href: "https://apps.shopify.com/search?q=PrepaidFlip",
  },
] as const;

export function PartnerSuiteFooter() {
  return (
    <section
      className="pico-bento-card pico-bento-card--slate"
      style={{ marginTop: 28 }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: "#0f172a",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheckIcon size={17} />
          </span>
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Complete your store revenue suite
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 12.5,
                color: "#64748b",
              }}
            >
              Zero-bloat companion instruments engineered with the same lightweight architecture as PicoSEO.
            </p>
          </div>
        </div>
        <span className="pico-pill pico-pill--info">Built for Shopify ecosystem</span>
      </div>

      <div className="pico-partner-grid">
        {PARTNER_APPS.map((app) => (
          <a
            key={app.name}
            href={app.href}
            target="_blank"
            rel="noopener noreferrer"
            className="pico-bento-card pico-bento-card--interactive"
            style={{
              padding: "14px 15px",
              textDecoration: "none",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                >
                  {app.name}
                </span>
                <ExternalArrowIcon size={14} style={{ color: "#64748b" }} />
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12,
                  lineHeight: 1.45,
                  color: "#475569",
                }}
              >
                {app.tagline}
              </p>
            </div>
            <div>
              <span className="pico-pill pico-pill--blue">{app.badge}</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
