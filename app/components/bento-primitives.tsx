import type { ReactNode } from "react";
import { scoreTone } from "../lib/seo-score";
import { ImageFrameIcon } from "./icons";

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
  score: number | null;
  size?: number;
}) {
  const hasScore = typeof score === "number" && Number.isFinite(score);
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = hasScore ? Math.max(0, Math.min(100, score)) : 0;
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
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
        role="img"
        aria-label={
          hasScore
            ? `Store SEO Health Score ${clamped} out of 100`
            : "Store SEO Health Score"
        }
      >
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
          {hasScore ? clamped : "—"}
        </span>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "#64748b",
            marginTop: 2,
          }}
        >
          {hasScore ? "Health score" : "No score"}
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


