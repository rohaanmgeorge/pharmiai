// Shape of GET /api/locker/:id, shared by the locker detail and "Show to doctor" screens.
export type LockerDetail = {
  prescription: {
    id: string;
    patientId: string;
    state: string;
    date: string;
    doctorName: string | null;
    photoUrl: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    active: boolean;
  };
  medicines: {
    id: string;
    name: string;
    strength: string;
    form: string;
    doseCode: string;
    doseMeaning: string | null; // from the fixed shorthand table, never AI
    durationDays: number;
    food: "before" | "after" | null;
    active: boolean;
  }[];
  canManage: boolean;
};
