import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * PrintPage — opened in a new tab via /print?url=...
 * Embeds the PDF in a full-screen iframe and auto-triggers window.print()
 * once the iframe reports it has loaded.
 */
export default function PrintPage() {
  const [location] = useLocation();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Parse the ?url= query param
  const params = new URLSearchParams(window.location.search);
  const pdfUrl = params.get("url") ?? "";

  useEffect(() => {
    if (!pdfUrl) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      // Small delay to let the PDF renderer finish before the print dialog opens
      setTimeout(() => {
        try {
          iframe.contentWindow?.print();
        } catch {
          // Fallback: print the parent window (which shows the iframe full-screen)
          window.print();
        }
      }, 800);
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [pdfUrl]);

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        No document specified.
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={pdfUrl}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        border: "none",
        margin: 0,
        padding: 0,
      }}
      title="Print Preview"
    />
  );
}
