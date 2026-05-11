import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Restaurant = {
  _id: string;
  name: string;
  phone?: string;
  location?: string;
  themeColor?: string;
  loyaltyProgram: string[];
};

export type Employee = {
  _id?: string;
  employeeId: string;
  name?: string;
  [k: string]: unknown;
};

type AuthState = {
  token: string | null;
  employeeId: string | null;
  employee: Employee | null;
  restaurant: Restaurant | null;
  setAuth: (data: { token: string; employeeId: string; employee?: Employee | null }) => void;
  setRestaurant: (r: Restaurant | null) => void;
  logout: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      employeeId: null,
      employee: null,
      restaurant: null,
      setAuth: ({ token, employeeId, employee }) =>
        set({ token, employeeId, employee: employee ?? null }),
      setRestaurant: (r) => set({ restaurant: r }),
      logout: () =>
        set({ token: null, employeeId: null, employee: null, restaurant: null }),
    }),
    { name: "loyalty-auth" }
  )
);
