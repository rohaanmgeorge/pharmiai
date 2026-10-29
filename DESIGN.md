# PharmiAI — Design System

Style: clean, airy, friendly health app. Soft lime-to-white gradient, white cards with big rounded corners and very soft shadows, lots of whitespace. Match the reference **style** only (no copied assets, names, or brand).

## 1. Color tokens

```css
:root {
  --bg-from: #EEF9D9;      /* page gradient top */
  --bg-to: #FFFFFF;        /* page gradient bottom */
  --surface: #FFFFFF;      /* cards */
  --surface-2: #F6F8F3;    /* inputs, chips, skeleton base */
  --lime-300: #D4F28A;     /* soft fills, user bubble alt, chart track */
  --lime-500: #A6E22E;     /* primary accent fill — DARK TEXT ONLY */
  --green-700: #3F7D20;    /* buttons with white text, links, focus ring */
  --text: #1F2937;         /* primary text */
  --text-2: #6B7280;       /* secondary text */
  --border: #E5E7EB;
  --danger: #DC2626;       /* stop / cancel / SOS only */
  --danger-soft: #FEE2E2;
  --warn: #B45309;         /* "Needs check" */
  --warn-soft: #FEF3C7;
  --ok: #15803D;           /* "Verified" */
  --ok-soft: #DCFCE7;
  --muted: #9CA3AF;        /* "Not recognized", missed bars */
}
```

**Contrast checks (WCAG AA ≥ 4.5:1 for text)**
| Pair | Ratio | Use |
|---|---|---|
| `--text` on `--lime-500` | ≈ 11:1 ✓ | primary button label, user bubble |
| white on `--lime-500` | ≈ 1.6:1 ✗ | **never** |
| white on `--green-700` | ≈ 5.0:1 ✓ | strong CTA ("Get Started →", "Approve") |
| `--text-2` on white | ≈ 4.8:1 ✓ | secondary text |
| white on `--danger` | ≈ 4.8:1 ✓ | SOS / stop |

Status is **never color alone**: every StatusBadge is dot + icon + text.
| Status | Color | Icon (lucide) | Label |
|---|---|---|---|
| Verified | `--ok` on `--ok-soft` | `ShieldCheck` | Verified |
| Needs check | `--warn` on `--warn-soft` | `AlertTriangle` | Needs check |
| Not recognized | `--muted` on `--surface-2` | `HelpCircle` | Not recognized |

## 2. Radii, shadows, spacing
| Token | Value |
|---|---|
| `--r-card` | 28px |
| `--r-sheet` | 32px (bottom sheets, top corners) |
| `--r-input` | 24px |
| `--r-sm` | 12px |
| `--r-pill` | 999px (buttons, chips, bubbles' outer corners) |
| `--shadow-card` | `0 8px 30px rgba(31,41,55,.06), 0 2px 6px rgba(31,41,55,.04)` |
| `--shadow-float` | `0 12px 40px rgba(31,41,55,.10)` (FAB, stat chips) |
| spacing | 4-pt scale: 4, 8, 12, 16, 20, 24, 32, 40, 56 |
| gutter | 16px phone · 24px tablet · 32px laptop |
| max width | 480px phone column; 1200px laptop |

## 3. Typography
- Latin: **Nunito** (rounded). Malayalam: **Noto Sans Malayalam**. Hindi: **Noto Sans Devanagari**. All via `next/font/google`, stacked: `font-family: var(--font-nunito), var(--font-ml), var(--font-dev), system-ui, sans-serif`.
- Indic scripts need extra line-height: 1.6 body (vs 1.5 Latin).

| Token | Size / line-height / weight | Use |
|---|---|---|
| `display` | 48 / 56 / 300 | AI response & voice transcript (phone 36/44) |
| `h1` | 28 / 36 / 700 | screen titles |
| `h2` | 22 / 30 / 700 | card titles |
| `body-lg` | 18 / 28 / 500 | chat text |
| `body` | 16 / 24 / 400 | default |
| `small` | 14 / 20 / 500 | role lines, timestamps |
| `micro` | 12 / 16 / 600 | chips, legend |

**Elder mode**: all sizes × 1.25, min body 20px, weight ≥ 500, one primary action per screen, a 96px Talk button.

## 4. Touch targets & layout
- Min 48×48px (Elder: 64×64). 8px min gap between targets.
- Phone: bottom nav (Chat · Today · Scan · Family · More) + floating **SOS** button always visible (bottom-right, above nav).
- Laptop (≥1024px): left side nav, two-pane layouts (prescription image | review items; family list | member dashboard).

## 5. Motion tokens
| Token | Value |
|---|---|
| `--dur-fast` | 150ms (press, chip) |
| `--dur-base` | 220ms (page, bubble, badge) |
| `--dur-slow` | 350ms (card expand, sheet) |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` |
| spring | `{ type: "spring", stiffness: 380, damping: 30 }` |
| press scale | 0.97 |
| loops | scan line 1.8s · bracket breathe 2s · stop pulse 1.6s · shimmer 1.4s |

Rules: animate only `transform` and `opacity`; 60fps; `prefers-reduced-motion` → fades only; Elder mode → durations × 1.5, no springs, no loops except waveform. Library: **Motion** (`motion/react`) — springs, `layout`/`layoutId` shared elements, `AnimatePresence`, `useReducedMotion`. CSS keyframes for simple loops.

## 6. Components
| Component | Notes |
|---|---|
| AppShell | gradient background, safe-area padding, page transition wrapper |
| BottomNav / SideNav | 5 items, active = lime pill behind icon |
| SOSFab | red round 64px, long-press or tap → countdown sheet |
| ChatHeader | assistant icon, "PharmiAI Assistant", settings gear |
| MessageBubble | user: `--lime-500` bg, dark text, time + read ticks; assistant: white card |
| AssistantCard | white card container for rich cards below |
| DoseCard | medicine, time, pill photo, Taken / Skip / Snooze pill buttons |
| MedicineCard | verified only: uses, side effects, source line |
| SavingsCard | brand vs Jan Aushadhi, yearly savings count-up |
| SOSStatusCard | contact rows with "Notified / I'm going ✓" chips |
| PillButton | outlined (default) / filled-dark-on-lime / filled-green-700 / danger |
| StatusBadge | dot + icon + text, morphs via `layoutId` |
| ExpandableCard | chevron rotates, height via `layout` |
| InputBar | mic left, "Type or tap mic to talk...", paperclip/camera, outlined round send |
| VoiceTranscript | huge centered text; final words dark, interim light + blinking cursor |
| Waveform | ~24 rounded lime bars, `scaleY` from AnalyserNode |
| RecordControls | X (left), red stop with pulse (center), ✓ (right), timer below |
| ScannerFrame | corner brackets, scan line, "Please hold still..." dark pill toast, capture button |
| StatChip | small floating white pill ("3 medicines found") |
| Toast | dark pill, bottom |
| AdherenceBars | 7 rounded vertical bars, lime taken / grey missed, legend |
| PersonListItem | avatar, name, role line, ConsentChip |
| ConsentChip | "Consent given" (check) / "Pending" (clock) / "Revoked" (x) |
| CountdownRing | conic-gradient ring, large calm number, Cancel button |
| QRCard | Emergency Medical Card QR + share link |
| Skeleton | shimmer block |
| EmptyState | friendly illustration + one action |
| OfflineBanner | top, calm grey: "Offline — showing saved schedule" |
| LanguagePicker | EN · മലയാളം · हिन्दी |
| ElderTalkButton | 96px round lime Talk button |
| SafetyDisclaimer | "PharmiAI is not a doctor. It never gives dose advice." |

## 7. Components for the committed features (PLAN §16)
| Component | Notes |
|---|---|
| LockerCard | date, doctor name (or "Doctor not added"), medicine count, Active (lime chip) / Completed (grey chip), 56px thumbnail; list entry staggered 40ms per card |
| SearchBar | rounded input 24px, search icon, clear button; searches confirmed text only |
| DoctorView | "Show to doctor": white full screen, medicine rows at `h1` size, no buttons except Close; screen stays awake |
| ScanModeToggle | pill toggle "Prescription · Medicine" above the capture button |
| ExpiryBadge | StatusBadge variants: OK (`--ok`, check), Expiring soon (`--warn`, clock), Expired (`--danger`, triangle) — always icon + text, never colour alone |
| CropPreview | zoomed photo crop of the unclear field above a large month/year picker |
| RefillCard | pill icon, "Runs out in N days", Jan Aushadhi line (Verified only), buttons "Review order" (green-700) and "Later" (outlined) |
| DraftEditor | editable message, language chips, share buttons WhatsApp / SMS / Email |
| OkayPrompt | full-screen calm overlay, 160px lime "I'm okay" button, no countdown, no flashing |
| CheckLadder | vertical steps (Asked → Family → Contacts) with ack chips "I'm checking" / "Reached ✓" |
| ElderSummaryCard | dashboard card: doses today (n/m), low stock, expiries, active check/SOS (red ring), last activity |
| LivePill | "● Live" (`--ok`), "Reconnecting…" (`--warn`, slow pulse), "Offline, last updated 10:42" (grey) |

Motion: dashboard values crossfade (220ms) on live update; a new dose tick does a single 0.97→1 scale. Reduced motion / Elder mode rules from §5 apply (no pulse loops in Elder mode).
