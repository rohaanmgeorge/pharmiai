// FICTIONAL demo data for the design phase. Brand names, prices and people are invented.
// Medicine facts here are placeholders shaped like the real database rows; once the
// backend exists these come only from the reviewed medicine_catalog table.

export type Status = "verified" | "needs_check" | "not_recognized";
export type Slot = "morning" | "afternoon" | "night";
export type DoseState = "pending" | "taken" | "skipped" | "snoozed" | "missed";

export type Medicine = {
  id: string;
  brand: string;
  ingredient: string;
  strength: string;
  form: string;
  doseCode: string; // e.g. "1-0-1", expanded from the shorthand table
  slots: Slot[];
  food: "after" | "before" | null;
  durationDays: number;
  status: Status;
  uses: string;
  sideEffects: string[];
  source: string;
  brandPricePerStrip: number;
  genericPricePerStrip: number;
  stripSize: number;
  stockLeft: number;
  color: string; // pill illustration color
};

export const patient = {
  name: "Saraswathi Menon",
  short: "Amma",
  age: 72,
  bloodGroup: "B+",
  allergies: ["Sulfa drugs"],
  conditions: ["Type 2 diabetes", "High blood pressure"],
  lang: "ml" as const,
};

export const medicines: Medicine[] = [
  {
    id: "glyconil",
    brand: "Glyconil 500",
    ingredient: "Metformin",
    strength: "500 mg",
    form: "Tablet",
    doseCode: "1-0-1",
    slots: ["morning", "night"],
    food: "after",
    durationDays: 30,
    status: "verified",
    uses: "Helps control blood sugar in type 2 diabetes.",
    sideEffects: ["Upset stomach", "Nausea", "Loose stools", "Metallic taste"],
    source: "Demo catalog · reviewed by team pharmacist (fictional)",
    brandPricePerStrip: 42,
    genericPricePerStrip: 11,
    stripSize: 10,
    stockLeft: 14,
    color: "#ffffff",
  },
  {
    id: "pressana",
    brand: "Pressana 5",
    ingredient: "Amlodipine",
    strength: "5 mg",
    form: "Tablet",
    doseCode: "1-0-0",
    slots: ["morning"],
    food: null,
    durationDays: 30,
    status: "verified",
    uses: "Lowers high blood pressure.",
    sideEffects: ["Ankle swelling", "Headache", "Flushing", "Tiredness"],
    source: "Demo catalog · reviewed by team pharmacist (fictional)",
    brandPricePerStrip: 64,
    genericPricePerStrip: 8,
    stripSize: 10,
    stockLeft: 4,
    color: "#fde68a",
  },
  {
    id: "atorvix",
    brand: "Atorvix 10",
    ingredient: "Atorvastatin",
    strength: "10 mg",
    form: "Tablet",
    doseCode: "0-0-1",
    slots: ["night"],
    food: "after",
    durationDays: 30,
    status: "verified",
    uses: "Lowers cholesterol.",
    sideEffects: ["Muscle aches", "Headache", "Upset stomach"],
    source: "Demo catalog · reviewed by team pharmacist (fictional)",
    brandPricePerStrip: 98,
    genericPricePerStrip: 14,
    stripSize: 10,
    stockLeft: 22,
    color: "#fecaca",
  },
  {
    id: "pantora",
    brand: "Pantora 40",
    ingredient: "Pantoprazole",
    strength: "40 mg",
    form: "Tablet",
    doseCode: "OD",
    slots: ["morning"],
    food: "before",
    durationDays: 5,
    status: "verified",
    uses: "Reduces stomach acid.",
    sideEffects: ["Headache", "Diarrhoea", "Wind"],
    source: "Demo catalog · reviewed by team pharmacist (fictional)",
    brandPricePerStrip: 120,
    genericPricePerStrip: 13,
    stripSize: 15,
    stockLeft: 3,
    color: "#bfdbfe",
  },
];

export const getMedicine = (id: string) => medicines.find((m) => m.id === id);

// ---------- Scan result (what the review screen shows) ----------
export type ScannedItem = {
  id: string;
  readingA: string; // Claude transcription
  readingB: string; // Cloud Vision transcription
  status: Status;
  reason?: string;
  medicineId?: string;
  candidates?: { id: string; brand: string; ingredient: string; strength: string }[];
  doseCode: string | null;
  durationDays: number | null;
  food: "after" | "before" | null;
  duplicateOf?: string;
};

export const scanResult: ScannedItem[] = [
  { id: "s1", readingA: "Glyconil 500", readingB: "Glyconil 500", status: "verified", medicineId: "glyconil", doseCode: "1-0-1", durationDays: 30, food: "after" },
  { id: "s2", readingA: "Pressana 5", readingB: "Pressana 5", status: "verified", medicineId: "pressana", doseCode: "1-0-0", durationDays: 30, food: null },
  {
    id: "s3",
    readingA: "Losarin 50",
    readingB: "Lasorin 50",
    status: "needs_check",
    reason: "The two readings disagree. Two medicines in our list look alike.",
    candidates: [
      { id: "losarin", brand: "Losarin 50", ingredient: "Losartan", strength: "50 mg" },
      { id: "lasorin", brand: "Lasorin 40", ingredient: "Furosemide", strength: "40 mg" },
    ],
    doseCode: "1-0-0",
    durationDays: 30,
    food: null,
  },
  {
    id: "s4",
    readingA: "Metsure SR 500",
    readingB: "Metsure SR 500",
    status: "needs_check",
    reason: "Duration is not readable. We never fill it in for you.",
    candidates: [{ id: "metsure", brand: "Metsure SR 500", ingredient: "Metformin", strength: "500 mg" }],
    doseCode: "0-0-1",
    durationDays: null,
    food: "after",
    duplicateOf: "Glyconil 500",
  },
  { id: "s5", readingA: "[unreadable]", readingB: "Tb. ?ol..m 2", status: "not_recognized", reason: "Handwriting unclear and no match in our medicine list.", doseCode: null, durationDays: null, food: null },
];

// ---------- Today ----------
export type Dose = { id: string; medicineId: string; time: string; slot: Slot; state: DoseState };

export const todayDoses: Dose[] = [
  { id: "d1", medicineId: "pantora", time: "07:30", slot: "morning", state: "taken" },
  { id: "d2", medicineId: "glyconil", time: "08:30", slot: "morning", state: "taken" },
  { id: "d3", medicineId: "pressana", time: "08:30", slot: "morning", state: "pending" },
  { id: "d4", medicineId: "glyconil", time: "20:30", slot: "night", state: "pending" },
  { id: "d5", medicineId: "atorvix", time: "21:00", slot: "night", state: "pending" },
];

export const weekAdherence = [
  { day: "Mon", taken: 5, total: 5 },
  { day: "Tue", taken: 4, total: 5 },
  { day: "Wed", taken: 5, total: 5 },
  { day: "Thu", taken: 3, total: 5 },
  { day: "Fri", taken: 5, total: 5 },
  { day: "Sat", taken: 5, total: 5 },
  { day: "Sun", taken: 2, total: 5 },
];

// ---------- Family ----------
export type Consent = "given" | "pending" | "revoked";
export type Member = { id: string; name: string; relation: string; role: "patient" | "caregiver" | "viewer"; consent: Consent; lang: string; color: string };

export const circle: Member[] = [
  { id: "amma", name: "Saraswathi Menon", relation: "Amma", role: "patient", consent: "given", lang: "മലയാളം", color: "#d4f28a" },
  { id: "anjali", name: "Anjali Menon", relation: "Daughter", role: "caregiver", consent: "given", lang: "English", color: "#fde68a" },
  { id: "rahul", name: "Rahul Menon", relation: "Son", role: "viewer", consent: "pending", lang: "हिन्दी", color: "#bfdbfe" },
];

export const caredFor = [
  { id: "amma", name: "Saraswathi Menon", relation: "Amma", age: 72, adherence: 87, next: "Pressana 5 · 08:30", alert: "Missed 1 dose today", color: "#d4f28a" },
  { id: "achan", name: "Gopalan Menon", relation: "Achan", age: 76, adherence: 96, next: "Atorvix 10 · 21:00", alert: null, color: "#fecaca" },
];

export const escalationTimeline = [
  { time: "08:30", text: "Reminder sent to Amma", icon: "bell" },
  { time: "09:00", text: "Not confirmed — reminded again", icon: "repeat" },
  { time: "09:00", text: "Anjali notified (English)", icon: "user" },
  { time: "09:30", text: "Rahul notified by email (हिन्दी)", icon: "mail" },
] as const;

// ---------- Emergency ----------
export type Contact = { id: string; name: string; relation: string; phone: string; priority: number; lang: string; color: string };

export const contacts: Contact[] = [
  { id: "c1", name: "Anjali Menon", relation: "Daughter", phone: "+91 90000 00001", priority: 1, lang: "English", color: "#fde68a" },
  { id: "c2", name: "Ravi Menon", relation: "Spouse", phone: "+91 90000 00002", priority: 2, lang: "മലയാളം", color: "#d4f28a" },
  { id: "c3", name: "Thomas Kurian", relation: "Guardian (care-of)", phone: "+91 90000 00003", priority: 3, lang: "മലയാളം", color: "#bfdbfe" },
];

export const yearlySavings = () =>
  medicines.reduce((sum, m) => {
    const perDay = m.slots.length;
    const tabletsPerYear = perDay * 365;
    const diffPerTablet = (m.brandPricePerStrip - m.genericPricePerStrip) / m.stripSize;
    return sum + diffPerTablet * tabletsPerYear;
  }, 0);

/** Shapes a demo dose for the shared DoseCard (design screens only). */
export const mockDose = (d: Dose) => {
  const m = getMedicine(d.medicineId)!;
  return { id: d.id, name: m.brand, form: m.form, food: m.food, time: d.time, state: d.state, color: m.color };
};
