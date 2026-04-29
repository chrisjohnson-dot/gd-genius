import { createContext, useContext, useState, type ReactNode } from "react";

export type Facility = {
  facilityId: number;
  facilityName: string;
};

type WarehouseContextValue = {
  /** null means "All Warehouses" */
  selectedFacilityId: number | null;
  setSelectedFacilityId: (id: number | null) => void;
  /** The facilityName of the selected facility (null when All is selected) */
  selectedFacilityName: string | null;
  /** The full list of known facilities (populated once the first query resolves) */
  facilities: Facility[];
  setFacilities: (f: Facility[]) => void;
};

const WarehouseContext = createContext<WarehouseContextValue>({
  selectedFacilityId: null,
  setSelectedFacilityId: () => {},
  selectedFacilityName: null,
  facilities: [],
  setFacilities: () => {},
});

const STORAGE_KEY = "gd_selected_facility_id";

export function WarehouseProvider({ children }: { children: ReactNode }) {
  const [selectedFacilityId, setSelectedFacilityIdState] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? parseInt(stored, 10) : null;
    } catch {
      return null;
    }
  });
  const [facilities, setFacilities] = useState<Facility[]>([]);

  const setSelectedFacilityId = (id: number | null) => {
    setSelectedFacilityIdState(id);
    try {
      if (id == null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(id));
      }
    } catch {}
  };

  const selectedFacilityName = selectedFacilityId != null
    ? (facilities.find((f) => f.facilityId === selectedFacilityId)?.facilityName ?? null)
    : null;

  return (
    <WarehouseContext.Provider value={{ selectedFacilityId, setSelectedFacilityId, selectedFacilityName, facilities, setFacilities }}>
      {children}
    </WarehouseContext.Provider>
  );
}

export function useWarehouse() {
  return useContext(WarehouseContext);
}
