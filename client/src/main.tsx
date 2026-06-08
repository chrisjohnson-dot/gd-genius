import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { WarehouseProvider } from "./contexts/WarehouseContext";

// Prevent the browser from auto-scrolling the sidebar (or any overflow container)
// back to the top when SPA navigation fires a pushState event.
if (typeof history !== 'undefined') {
  history.scrollRestoration = 'manual';
}

const queryClient = new QueryClient();

// Shared login is used — do NOT redirect to Manus OAuth on unauthorized errors.
// The AppLayout SharedLoginGate handles unauthenticated state.
queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    console.error("[API Mutation Error]", error);
  }
});

// Shared fetch wrapper — logs non-JSON responses for diagnostics
function gdFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, {
    ...(init ?? {}),
    credentials: "include",
  }).then(async (res) => {
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      const url = typeof input === "string" ? input : (input as Request).url;
      const body = await res.clone().text().catch(() => "(unreadable)");
      console.error(
        `[tRPC] Non-JSON response from ${url}\n` +
        `  Status: ${res.status} ${res.statusText}\n` +
        `  Content-Type: ${ct}\n` +
        `  Body preview: ${body.slice(0, 300)}`
      );
    }
    return res;
  });
}

const trpcClient = trpc.createClient({
  links: [
    // Mutations (e.g. scanBarcode) bypass batching so a slow Extensiv UPC lookup
    // cannot block or corrupt other concurrent requests.
    splitLink({
      condition: (op) => op.type === "mutation",
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: gdFetch,
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: gdFetch,
      }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <WarehouseProvider>
        <App />
      </WarehouseProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
