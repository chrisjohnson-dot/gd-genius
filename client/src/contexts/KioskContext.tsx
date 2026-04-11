/**
 * KioskContext.tsx
 * Provides a global kiosk/TV-mode flag that LivePullBoard sets and AppLayout reads
 * to hide the sidebar when the board is in full-screen kiosk mode.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface KioskContextValue {
  isKiosk: boolean;
  enterKiosk: () => void;
  exitKiosk: () => void;
  toggleKiosk: () => void;
}

const KioskContext = createContext<KioskContextValue>({
  isKiosk: false,
  enterKiosk: () => {},
  exitKiosk: () => {},
  toggleKiosk: () => {},
});

export function KioskProvider({ children }: { children: ReactNode }) {
  const [isKiosk, setIsKiosk] = useState(false);

  const enterKiosk = useCallback(() => setIsKiosk(true), []);
  const exitKiosk = useCallback(() => setIsKiosk(false), []);
  const toggleKiosk = useCallback(() => setIsKiosk((v) => !v), []);

  return (
    <KioskContext.Provider value={{ isKiosk, enterKiosk, exitKiosk, toggleKiosk }}>
      {children}
    </KioskContext.Provider>
  );
}

export function useKiosk() {
  return useContext(KioskContext);
}
