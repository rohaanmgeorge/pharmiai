// Shapes of GET /api/refills, shared by the refill screens (and Home/chat later).
import type { Lang } from "@/lib/i18n";

export type Pharmacy = { name: string | null; phone: string | null; email: string | null };

export type Refill = {
  id: string;
  patientId: string;
  scheduleId: string;
  state: "open" | "later" | "approved" | "refilled" | "dismissed";
  medicine: { name: string; strength: string; form: string };
  stock: number;
  dosesPerDay: number;
  daysLeft: number;
  runoutDate: string;
  quantity: number;
  lang: Lang;
  draftText: string | null;
  laterUntil: string | null;
  approvedBy: { name: string; at: string } | null;
  refilled: { name: string; qty: number; at: string } | null;
  generic: { name: string; strength: string; pricePerUnit: number; brandPricePerUnit: number | null; packSize: number } | null;
};

export type RefillsData = { patientId: string; canManage: boolean; pharmacy: Pharmacy; refills: Refill[] };

export type Channel = "whatsapp" | "sms" | "email";
