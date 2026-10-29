// Friendly, original inline-SVG illustrations (no external assets).

export function AssistantIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="20" fill="#a6e22e" />
      <path d="M20 9c1.2 5.6 3.6 8 9.2 9.2-5.6 1.2-8 3.6-9.2 9.2-1.2-5.6-3.6-8-9.2-9.2C16.4 17 18.8 14.6 20 9Z" fill="#1f2937" />
      <circle cx="28.5" cy="27.5" r="2.2" fill="#1f2937" />
    </svg>
  );
}

export function OnboardingIllustration({ variant = 0 }: { variant?: 0 | 1 | 2 }) {
  return (
    <svg viewBox="0 0 320 260" className="h-auto w-full max-w-[320px]" aria-hidden>
      <ellipse cx="160" cy="236" rx="120" ry="12" fill="#1f2937" opacity=".06" />
      <circle cx="160" cy="125" r="100" fill="#d4f28a" opacity=".6" />
      <circle cx="160" cy="125" r="72" fill="#ffffff" />
      {variant === 0 && (
        <g>
          {/* Prescription + scan brackets */}
          <rect x="118" y="70" width="84" height="108" rx="12" fill="#fff" stroke="#e5e7eb" strokeWidth="3" />
          <rect x="132" y="88" width="40" height="6" rx="3" fill="#a6e22e" />
          {[104, 118, 132, 146].map((y, i) => (
            <rect key={y} x="132" y={y} width={i % 2 ? 44 : 56} height="5" rx="2.5" fill="#e5e7eb" />
          ))}
          <path d="M104 74v-12a8 8 0 0 1 8-8h12M216 74v-12a8 8 0 0 0-8-8h-12M104 174v12a8 8 0 0 0 8 8h12M216 174v12a8 8 0 0 1-8 8h-12" stroke="#3f7d20" strokeWidth="5" strokeLinecap="round" fill="none" />
          <rect x="112" y="124" width="96" height="3" rx="1.5" fill="#a6e22e" />
        </g>
      )}
      {variant === 1 && (
        <g>
          {/* Clock + pill */}
          <circle cx="160" cy="118" r="44" fill="#fff" stroke="#1f2937" strokeWidth="4" />
          <path d="M160 92v26l18 12" stroke="#1f2937" strokeWidth="5" strokeLinecap="round" fill="none" />
          <g transform="rotate(-35 214 168)">
            <rect x="188" y="156" width="56" height="24" rx="12" fill="#a6e22e" stroke="#1f2937" strokeWidth="3" />
            <path d="M216 156v24" stroke="#1f2937" strokeWidth="3" />
            <rect x="216" y="157.5" width="26.5" height="21" rx="10.5" fill="#fff" />
          </g>
          <circle cx="104" cy="170" r="10" fill="#fde68a" stroke="#1f2937" strokeWidth="3" />
        </g>
      )}
      {variant === 2 && (
        <g>
          {/* Family hearts */}
          <circle cx="126" cy="112" r="20" fill="#fde68a" stroke="#1f2937" strokeWidth="3" />
          <path d="M96 172c0-20 13-32 30-32s30 12 30 32" fill="#fde68a" stroke="#1f2937" strokeWidth="3" />
          <circle cx="196" cy="106" r="24" fill="#bfdbfe" stroke="#1f2937" strokeWidth="3" />
          <path d="M160 176c0-24 16-38 36-38s36 14 36 38" fill="#bfdbfe" stroke="#1f2937" strokeWidth="3" />
          <path d="M160 70c-6-10-22-6-18 6 3 8 18 16 18 16s15-8 18-16c4-12-12-16-18-6Z" fill="#dc2626" />
        </g>
      )}
    </svg>
  );
}

export function EmptyIllustration({ kind }: { kind: "meds" | "family" | "contacts" | "error" | "offline" }) {
  const accent = kind === "error" ? "#fee2e2" : kind === "offline" ? "#e5e7eb" : "#d4f28a";
  return (
    <svg viewBox="0 0 160 120" className="mx-auto h-28 w-auto" aria-hidden>
      <ellipse cx="80" cy="110" rx="56" ry="6" fill="#1f2937" opacity=".06" />
      <circle cx="80" cy="56" r="48" fill={accent} opacity=".7" />
      {kind === "meds" && (
        <g transform="rotate(-30 80 56)">
          <rect x="50" y="44" width="60" height="26" rx="13" fill="#fff" stroke="#1f2937" strokeWidth="3" />
          <path d="M80 44v26" stroke="#1f2937" strokeWidth="3" />
          <rect x="51.5" y="45.5" width="28.5" height="23" rx="11.5" fill="#a6e22e" />
        </g>
      )}
      {kind === "family" && (
        <g>
          <circle cx="66" cy="46" r="12" fill="#fff" stroke="#1f2937" strokeWidth="3" />
          <circle cx="98" cy="50" r="10" fill="#fff" stroke="#1f2937" strokeWidth="3" />
          <path d="M46 86c0-14 9-22 20-22s20 8 20 22M82 86c0-12 7-18 16-18s16 6 16 18" fill="#fff" stroke="#1f2937" strokeWidth="3" />
        </g>
      )}
      {kind === "contacts" && (
        <g>
          <rect x="56" y="24" width="48" height="66" rx="10" fill="#fff" stroke="#1f2937" strokeWidth="3" />
          <path d="M70 48c3 7 9 13 16 16l4-4 7 4-3 7c-14-2-28-16-30-30l7-3 4 7Z" fill="#a6e22e" stroke="#1f2937" strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      )}
      {kind === "error" && (
        <g>
          <circle cx="80" cy="56" r="26" fill="#fff" stroke="#1f2937" strokeWidth="3" />
          <path d="M80 42v16" stroke="#dc2626" strokeWidth="5" strokeLinecap="round" />
          <circle cx="80" cy="68" r="3.5" fill="#dc2626" />
        </g>
      )}
      {kind === "offline" && (
        <g fill="none" stroke="#1f2937" strokeWidth="4" strokeLinecap="round">
          <path d="M52 52a40 40 0 0 1 56 0M62 62a26 26 0 0 1 36 0M72 72a12 12 0 0 1 16 0" />
          <path d="M50 30l60 60" stroke="#6b7280" />
        </g>
      )}
    </svg>
  );
}

/** Stylised prescription paper used as the "photo" on the review screen in design mode. */
export function PrescriptionPaper() {
  const rows = [
    ["Glyconil 500", "1-0-1 × 30d"],
    ["Pressana 5", "1-0-0 × 30d"],
    ["Losarin 50 (?)", "1-0-0 × 30d"],
    ["Metsure SR 500", "0-0-1 × ??"],
    ["Tb. ?ol..m 2", "?"],
  ];
  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-sm rotate-[-1.5deg] rounded-[20px] bg-[#fffdf6] p-6 shadow-card">
      <div className="border-b-2 border-dashed border-line pb-3">
        <div className="text-lg font-extrabold text-ink">Dr. A. Fictional, MBBS</div>
        <div className="text-xs text-ink-2">Demo Clinic · Kochi · Reg. No. 00000</div>
      </div>
      <div className="mt-3 text-sm text-ink-2">Pt: S. Menon, 72F · 29/10/2026</div>
      <div className="mt-2 text-2xl font-light text-ink italic">℞</div>
      <ul className="mt-2 space-y-3" style={{ fontFamily: "cursive" }}>
        {rows.map(([n, d], i) => (
          <li key={n} className={i >= 2 ? "text-ink/70" : "text-ink"} style={{ filter: i === 4 ? "blur(1.2px)" : undefined }}>
            <span className="text-base">{n}</span> <span className="text-sm text-ink-2">— {d}</span>
          </li>
        ))}
      </ul>
      <div className="absolute right-6 bottom-6 text-sm text-ink-2 italic" style={{ fontFamily: "cursive" }}>
        signature
      </div>
    </div>
  );
}
