interface StateBadgeProps {
  label: string;
  tone?: "cyan" | "pink" | "yellow" | "green" | "neutral";
}

const toneClasses = {
  cyan: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  pink: "border-pink-300/30 bg-pink-300/10 text-pink-100",
  yellow: "border-yellow-300/30 bg-yellow-300/10 text-yellow-100",
  green: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  neutral: "border-white/15 bg-white/10 text-white/75",
};

export function StateBadge({ label, tone = "neutral" }: StateBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.2em] ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}
