import { createTRPCReact } from "@trpc/react-query";
import type { appRouterWithProductionLine } from "../../../server/routers";

export const trpc = createTRPCReact<typeof appRouterWithProductionLine>();
