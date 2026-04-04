import { createTRPCReact } from "@trpc/react-query";
import type { appRouterFull } from "../../../server/routers";
export const trpc = createTRPCReact<typeof appRouterFull>();
