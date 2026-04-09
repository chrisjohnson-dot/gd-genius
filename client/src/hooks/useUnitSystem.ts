/**
 * useUnitSystem — persisted metric/imperial preference for packaging dimensions.
 *
 * Dimensions are stored in the DB as metric (cm / kg).
 * This hook converts them for display and provides a toggle button label.
 */
import { useLocalStorage } from "./useLocalStorage";

export type UnitSystem = "metric" | "imperial";

export function useUnitSystem() {
  const [unit, setUnit] = useLocalStorage<UnitSystem>("sp_unit_system", "imperial");

  const toggle = () => setUnit((u) => (u === "metric" ? "imperial" : "metric"));

  /** Format a dimension stored in cm for display */
  const fmtDim = (cm: string | number | null | undefined): string => {
    if (cm == null || cm === "") return "";
    const val = typeof cm === "string" ? parseFloat(cm) : cm;
    if (isNaN(val)) return "";
    if (unit === "imperial") {
      const inches = val / 2.54;
      return `${inches % 1 === 0 ? inches.toFixed(0) : inches.toFixed(1)}"`;
    }
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)} cm`;
  };

  /** Format a weight stored in kg for display */
  const fmtWt = (kg: string | number | null | undefined): string => {
    if (kg == null || kg === "") return "";
    const val = typeof kg === "string" ? parseFloat(kg) : kg;
    if (isNaN(val)) return "";
    if (unit === "imperial") {
      const lbs = val * 2.20462;
      return `${lbs % 1 === 0 ? lbs.toFixed(0) : lbs.toFixed(1)} lbs`;
    }
    return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)} kg`;
  };

  /** Format L × W × H dimensions joined with × */
  const fmtDims = (
    l: string | number | null | undefined,
    w: string | number | null | undefined,
    h: string | number | null | undefined
  ): string => {
    const parts = [fmtDim(l), fmtDim(w), fmtDim(h)].filter(Boolean);
    return parts.join(" × ");
  };

  const label = unit === "metric" ? "Switch to Imperial" : "Switch to Metric";
  const unitLabel = unit === "metric" ? "Metric" : "Imperial";

  return { unit, toggle, fmtDim, fmtWt, fmtDims, label, unitLabel };
}
