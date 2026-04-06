import { createTRPCReact } from "@trpc/react-query";
import type { appRouterV4 } from "../../../server/routers";
export const trpc = createTRPCReact<typeof appRouterV4>();
