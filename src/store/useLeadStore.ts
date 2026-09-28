import { create } from 'zustand';

interface LeadStore {
  leads: any[];
  setLeads: (leads: any[]) => void;
  removeLead: (id: string) => void;
  updateLead: (id: string, updates: any) => void;
}

export const useLeadStore = create<LeadStore>((set) => ({
  leads: [],
  // Load the initial 50 items
  setLeads: (leads) => set({ leads }),
  // Instantly hide a card when approved/rejected
  removeLead: (id) => set((state) => ({ leads: state.leads.filter((l) => l.id !== id) })),
  // Instantly update the image when BG is removed or uploaded
  updateLead: (id, updates) => set((state) => ({
    leads: state.leads.map((l) => (l.id === id ? { ...l, ...updates } : l))
  })),
}));