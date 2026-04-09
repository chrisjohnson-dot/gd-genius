/**
 * useUnitSystem — persisted metric/imperial preference for packaging dimensions.
 *
 * Dimensions stored in the DB are metric (cm / kg).
 * Extensiv returns dimensions in imperial (inches / lbs) via the `imperial` object.
 * This hook provides formatters for both sources.
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

  /** Format L × W × H dimensions (from cm) joined with × */
  const fmtDims = (
    l: string | number | null | undefined,
    w: string | number | null | undefined,
    h: string | number | null | undefined
  ): string => {
    const parts = [fmtDim(l), fmtDim(w), fmtDim(h)].filter(Boolean);
    return parts.join(" × ");
  };

  /**
   * Format a dimension that is already in inches (from Extensiv's imperial object).
   * In metric mode converts to cm; in imperial mode displays as-is.
   */
  const fmtInch = (inches: number | null | undefined): string => {
    if (inches == null) return "";
    if (unit === "imperial") {
      return `${inches % 1 === 0 ? inches.toFixed(0) : inches.toFixed(1)}"`;
    }
    const cm = inches * 2.54;
    return `${cm % 1 === 0 ? cm.toFixed(0) : cm.toFixed(1)} cm`;
  };

  /**
   * Format a weight that is already in lbs (from Extensiv's imperial object).
   * In metric mode converts to kg; in imperial mode displays as-is.
   */
  const fmtLbs = (lbs: number | null | undefined): string => {
    if (lbs == null) return "";
    if (unit === "imperial") {
      return `${lbs % 1 === 0 ? lbs.toFixed(0) : lbs.toFixed(1)} lbs`;
    }
    const kg = lbs / 2.20462;
    return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)} kg`;
  };

  /**
   * Format L × W × H from Extensiv's imperial object (values in inches).
   */
  const fmtInchDims = (
    l: number | null | undefined,
    w: number | null | undefined,
    h: number | null | undefined
  ): string => {
    const parts = [fmtInch(l), fmtInch(w), fmtInch(h)].filter(Boolean);
    return parts.join(" × ");
  };

  const label = unit === "metric" ? "Switch to Imperial" : "Switch to Metric";
  const unitLabel = unit === "metric" ? "Metric (cm/kg)" : "Imperial (in/lbs)";

  return { unit, toggle, fmtDim, fmtWt, fmtDims, fmtInch, fmtLbs, fmtInchDims, label, unitLabel };
}
