// Shapes returned by /api/dashboard, /api/circle and /api/checks/:id (kept in one place for the screens).

export type PersonSummary = {
  id: string;
  name: string;
  role: "self" | "caregiver" | "viewer";
  canManage: boolean;
  presence: "home" | "away" | "hospital" | string;
  lastActivityAt: string;
  checkConsent: boolean;
  doses: { taken: number; missed: number; total: number; nextAt: string | null };
  medicines: number;
  lowStock: number;
  expiringSoon: number;
  check: { id: string; state: string; level: number; startedAt: string } | null;
  sos: { id: string; startedAt: string; isTest: boolean } | null;
};

export type DashboardData = { me: string; people: PersonSummary[]; at: string };

export type Contact = { id: string; name: string; phone: string; relation: string; priority: number };

export type TimelineEvent = { id: string; at: string; kind: "missed" | "check" | "alert" | "ack" | "ended"; text: string; checkId?: string };

export type PersonDetail = { me: string; person: PersonSummary; timeline: TimelineEvent[]; contacts: Contact[]; at: string };

export type CircleLink = {
  id: string;
  role: "caregiver" | "viewer";
  consent: "pending" | "given" | "revoked";
  person: { id: string; name: string; lang: string };
};

export type CircleData = { me: string; members: CircleLink[]; caringFor: CircleLink[] };

export type AdherenceData = { patientId: string; days: { date: string; day: string; taken: number; total: number }[] };

export type CheckAlert = {
  id: string;
  level: number;
  member_id: string | null;
  contact_id: string | null;
  channel: "push" | "link";
  sent_at: string;
  ack: "checking" | "reached" | null;
  acked_at: string | null;
  memberName: string | null;
  ackedByName: string | null;
  mine: boolean;
};

export type CheckData = {
  check: { id: string; patient_id: string; state: string; level: number; started_at: string; last_step_at: string; ended_at: string | null; endedByName: string | null };
  patient: { id: string; name: string; waitMin: number };
  alerts: CheckAlert[];
  contacts: Contact[];
  isPatient: boolean;
  canManage: boolean;
};
