import { z } from "zod";
import { eq, and, desc, sql, inArray, ne, like } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { invokeLLM } from "../_core/llm";
import {
  directlyConversations,
  directlyParticipants,
  directlyMessages,
  directlyPresence,
  directlyGopherLogs,
  users,
  orderTracking,
} from "../../drizzle/schema";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOPHER_SENDER_ID = 0; // virtual sender ID for Gopher

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function ensurePresence(db: Db, userId: number) {
  const existing = await db
    .select()
    .from(directlyPresence)
    .where(eq(directlyPresence.userId, userId))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(directlyPresence).values({
      id: randomUUID(),
      userId,
      status: "online",
      lastSeenAt: new Date(),
    });
  } else {
    await db
      .update(directlyPresence)
      .set({ status: "online", lastSeenAt: new Date() })
      .where(eq(directlyPresence.userId, userId));
  }
}

async function getOrCreateConversation(
  db: Db,
  type: string,
  participantIds: number[],
  opts?: { name?: string; entityType?: string; entityId?: string }
): Promise<string> {
  if (type === "dm" && participantIds.length === 2) {
    const [a, b] = participantIds;
    const existing = await db
      .select({ id: directlyConversations.id })
      .from(directlyConversations)
      .innerJoin(
        directlyParticipants,
        eq(directlyParticipants.conversationId, directlyConversations.id)
      )
      .where(
        and(
          eq(directlyConversations.type, "dm"),
          inArray(directlyParticipants.userId, [a, b])
        )
      )
      .groupBy(directlyConversations.id)
      .having(sql`COUNT(DISTINCT ${directlyParticipants.userId}) = 2`)
      .limit(1);
    if (existing.length > 0) return existing[0].id;
  }

  if (type === "entity" && opts?.entityType && opts?.entityId) {
    const existing = await db
      .select({ id: directlyConversations.id })
      .from(directlyConversations)
      .where(
        and(
          eq(directlyConversations.type, "entity"),
          eq(directlyConversations.entityType, opts.entityType),
          eq(directlyConversations.entityId, opts.entityId)
        )
      )
      .limit(1);
    if (existing.length > 0) return existing[0].id;
  }

  if (type === "gopher_dm" && participantIds.length === 1) {
    const [userId] = participantIds;
    const existing = await db
      .select({ convId: directlyConversations.id })
      .from(directlyConversations)
      .innerJoin(
        directlyParticipants,
        eq(directlyParticipants.conversationId, directlyConversations.id)
      )
      .where(
        and(
          eq(directlyConversations.type, "gopher_dm"),
          eq(directlyParticipants.userId, userId)
        )
      )
      .limit(1);
    if (existing.length > 0) return existing[0].convId;
  }

  const convId = randomUUID();
  await db.insert(directlyConversations).values({
    id: convId,
    type,
    name: opts?.name,
    entityType: opts?.entityType,
    entityId: opts?.entityId,
  });

  for (const uid of participantIds) {
    await db.insert(directlyParticipants).values({
      id: randomUUID(),
      conversationId: convId,
      userId: uid,
      joinedAt: new Date(),
      lastReadAt: new Date(0),
    });
  }

  return convId;
}

// ---------------------------------------------------------------------------
// ── GENIUS: Gopher system prompts ──────────────────────────────────────────
// Adapt these two prompts to match Genius's feature set and terminology.
// ---------------------------------------------------------------------------

const GOPHER_SYSTEM_PROMPT = `You are Gopher, an AI assistant embedded inside GD Genius — a warehouse operations platform for Go Direct Logistics.

Your job is to intercept messages that users are about to send to each other and check whether you can answer the question directly, saving them time.

You must respond with JSON in this exact format:
{
  "shouldIntercept": boolean,
  "confidence": number (0-100),
  "category": string (one of: "order_allocation" | "receiving" | "put_away" | "pick_pack" | "shipment" | "inventory" | "qc_scan" | "navigation" | "report" | "general" | "none"),
  "answer": string (the answer to show the user, or "" if shouldIntercept is false),
  "walkthroughId": string (optional, one of the walkthrough IDs below if navigation help is needed, or ""),
  "tone": string ("helpful" | "concise" | "encouraging")
}

Intercept ONLY if confidence >= 70. Do NOT intercept casual conversation, greetings, or messages clearly meant for a human.

Available walkthrough IDs:
- "nav_allocate_orders" — how to allocate orders for a client
- "nav_receiving_dashboard" — how to use the receiving dashboard
- "nav_put_away_wizard" — how to run the Put Away Wizard
- "nav_run_history" — how to view and manage allocation run history
- "nav_print_documents" — how to print pull lists and pack lists
- "nav_qc_scan" — how to use the QC Scan and Label workflow
- "nav_client_selection" — how to select a client and view unallocated orders
- "nav_reorder_rules" — how to configure auto-run and allocation rules
- "nav_fefo_rules" — how FEFO and location priority rules work
- "nav_export_documents" — how to export PDF pull lists and pack lists`;

// Gopher DM assistant prompt — used when user chats directly with Gopher
const GOPHER_DM_SYSTEM = `You are Gopher, an AI assistant inside GD Genius — a warehouse operations platform for Go Direct Logistics.

You help warehouse staff and operations managers find information, navigate the app, and understand allocation and receiving workflows. Be concise, friendly, and specific. Use markdown formatting.

You have access to real-time context provided in the user message. Always answer based on the context provided.

If the user asks to navigate somewhere, respond with a JSON block at the end of your message:
\`\`\`navigate
{"path": "/allocation", "label": "Go to Allocation"}
\`\`\`

Available paths: /allocation, /receiving, /put-away, /run-history, /clients, /inventory, /shipments, /qc-scan, /settings`;

// ---------------------------------------------------------------------------
// Gopher intent classification
// ---------------------------------------------------------------------------

async function classifyGopherIntent(
  message: string,
  context: { orderCount?: number; lowStockCount?: number }
): Promise<{
  shouldIntercept: boolean;
  confidence: number;
  category: string;
  answer: string;
  walkthroughId: string;
  tone: string;
}> {
  try {
    const contextStr = context.orderCount
      ? `\n\nCurrent context: ${context.orderCount} total orders, ${context.lowStockCount ?? 0} low-stock SKUs.`
      : "";

    const response = await invokeLLM({
      messages: [
        { role: "system", content: GOPHER_SYSTEM_PROMPT + contextStr },
        { role: "user", content: `User is about to send this message: "${message}"` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gopher_intercept",
          strict: true,
          schema: {
            type: "object",
            properties: {
              shouldIntercept: { type: "boolean" },
              confidence: { type: "number" },
              category: { type: "string" },
              answer: { type: "string" },
              walkthroughId: { type: "string" },
              tone: { type: "string" },
            },
            required: ["shouldIntercept", "confidence", "category", "answer", "walkthroughId", "tone"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (!content) throw new Error("No content from LLM");
    return JSON.parse(content) as {
      shouldIntercept: boolean;
      confidence: number;
      category: string;
      answer: string;
      walkthroughId: string;
      tone: string;
    };
  } catch {
    return { shouldIntercept: false, confidence: 0, category: "none", answer: "", walkthroughId: "", tone: "helpful" };
  }
}

// ---------------------------------------------------------------------------
// Gopher DM query handler
// ---------------------------------------------------------------------------

async function handleGopherDmQuery(
  message: string,
  context: Record<string, unknown>
): Promise<string> {
  try {
    const contextStr = JSON.stringify(context, null, 2);
    const response = await invokeLLM({
      messages: [
        { role: "system", content: GOPHER_DM_SYSTEM },
        { role: "user", content: `Context:\n${contextStr}\n\nUser question: ${message}` },
      ],
    });
    const rawContent = response?.choices?.[0]?.message?.content;
    return typeof rawContent === "string"
      ? rawContent
      : "I'm not sure about that. Try checking the relevant page directly.";
  } catch {
    return "I'm having trouble connecting right now. Please try again in a moment.";
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const directlyRouter = router({
  listConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await ensurePresence(db, ctx.user.id);

    const participations = await db
      .select({ conversationId: directlyParticipants.conversationId, lastReadAt: directlyParticipants.lastReadAt })
      .from(directlyParticipants)
      .where(eq(directlyParticipants.userId, ctx.user.id));

    if (participations.length === 0) return [];

    const convIds = participations.map((p) => p.conversationId);
    const lastReadMap = new Map(participations.map((p) => [p.conversationId, p.lastReadAt]));

    const conversations = await db
      .select()
      .from(directlyConversations)
      .where(inArray(directlyConversations.id, convIds))
      .orderBy(desc(directlyConversations.updatedAt));

    const result = await Promise.all(
      conversations.map(async (conv) => {
        const lastMsg = await db
          .select()
          .from(directlyMessages)
          .where(and(eq(directlyMessages.conversationId, conv.id), sql`${directlyMessages.deletedAt} IS NULL`))
          .orderBy(desc(directlyMessages.createdAt))
          .limit(1);

        const lastReadAt = lastReadMap.get(conv.id) ?? new Date(0);
        const unreadCount = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(directlyMessages)
          .where(
            and(
              eq(directlyMessages.conversationId, conv.id),
              sql`${directlyMessages.createdAt} > ${lastReadAt}`,
              ne(directlyMessages.senderId, ctx.user.id),
              sql`${directlyMessages.deletedAt} IS NULL`
            )
          );

        const otherParticipants = await db
          .select({ userId: directlyParticipants.userId, name: users.name, email: users.email })
          .from(directlyParticipants)
          .innerJoin(users, eq(users.id, directlyParticipants.userId))
          .where(and(eq(directlyParticipants.conversationId, conv.id), ne(directlyParticipants.userId, ctx.user.id)));

        const presenceData = otherParticipants.length > 0
          ? await db.select().from(directlyPresence).where(inArray(directlyPresence.userId, otherParticipants.map((p) => p.userId)))
          : [];
        const presenceMap = new Map(presenceData.map((p) => [p.userId, p.status]));

        return {
          ...conv,
          lastMessage: lastMsg[0] ?? null,
          unreadCount: Number(unreadCount[0]?.count ?? 0),
          participants: otherParticipants.map((p) => ({ ...p, presence: presenceMap.get(p.userId) ?? "offline" })),
        };
      })
    );

    return result;
  }),

  getOrCreateDm: protectedProcedure
    .input(z.object({ targetUserId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const convId = await getOrCreateConversation(db, "dm", [ctx.user.id, input.targetUserId]);
      return { conversationId: convId };
    }),

  getOrCreateEntityThread: protectedProcedure
    .input(z.object({ entityType: z.string(), entityId: z.string(), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const convId = await getOrCreateConversation(db, "entity", [ctx.user.id], {
        entityType: input.entityType, entityId: input.entityId, name: input.name,
      });
      const existing = await db
        .select()
        .from(directlyParticipants)
        .where(and(eq(directlyParticipants.conversationId, convId), eq(directlyParticipants.userId, ctx.user.id)))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(directlyParticipants).values({
          id: randomUUID(), conversationId: convId, userId: ctx.user.id, joinedAt: new Date(), lastReadAt: new Date(0),
        });
      }
      return { conversationId: convId };
    }),

  getGopherDm: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const convId = await getOrCreateConversation(db, "gopher_dm", [ctx.user.id], { name: "Gopher AI" });

    const msgCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(directlyMessages)
      .where(eq(directlyMessages.conversationId, convId));

    const isNew = Number(msgCount[0]?.count ?? 0) === 0;
    if (isNew) {
      await db.insert(directlyMessages).values({
        id: randomUUID(),
        conversationId: convId,
        senderId: GOPHER_SENDER_ID,
        // ── GENIUS: Update this welcome message to match Genius's feature set ──
        body: `👋 Hey there! I'm **Gopher**, your AI assistant inside GD Genius.\n\nI can help you:\n- **Allocate orders** — find unallocated orders, run allocation, review results\n- **Navigate the app** — show you exactly where to go and how to use features\n- **Understand workflows** — explain FEFO rules, put-away logic, receiving steps\n\nJust ask me anything! For example:\n> "How do I allocate orders for a client?"\n> "Where do I start a receipt?"\n> "How does FEFO work in Genius?"`,
        isGopherMessage: true,
        createdAt: new Date(),
      });
    }

    return { conversationId: convId, isNew };
  }),

  createGroupConversation: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(100), participantIds: z.array(z.number()).min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const allParticipants = Array.from(new Set([ctx.user.id, ...input.participantIds]));
      const convId = await getOrCreateConversation(db, "group", allParticipants, { name: input.name });
      return { conversationId: convId };
    }),

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.string(), limit: z.number().min(1).max(100).default(50), before: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const participation = await db
        .select()
        .from(directlyParticipants)
        .where(and(eq(directlyParticipants.conversationId, input.conversationId), eq(directlyParticipants.userId, ctx.user.id)))
        .limit(1);

      if (participation.length === 0) {
        const conv = await db.select().from(directlyConversations).where(eq(directlyConversations.id, input.conversationId)).limit(1);
        if (conv[0]?.type === "entity") {
          await db.insert(directlyParticipants).values({
            id: randomUUID(), conversationId: input.conversationId, userId: ctx.user.id, joinedAt: new Date(), lastReadAt: new Date(0),
          });
        } else {
          return [];
        }
      }

      const msgs = await db
        .select()
        .from(directlyMessages)
        .where(and(eq(directlyMessages.conversationId, input.conversationId), sql`${directlyMessages.deletedAt} IS NULL`))
        .orderBy(desc(directlyMessages.createdAt))
        .limit(input.limit);

      const senderIds = Array.from(new Set(msgs.map((m) => m.senderId).filter((id) => id !== GOPHER_SENDER_ID)));
      const senderData = senderIds.length > 0
        ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, senderIds))
        : [];
      const senderMap = new Map(senderData.map((u) => [u.id, u]));

      return msgs.reverse().map((msg) => ({
        ...msg,
        sender: msg.senderId === GOPHER_SENDER_ID
          ? { id: 0, name: "Gopher", email: "gopher@gdgenius.ai" }
          : senderMap.get(msg.senderId) ?? { id: msg.senderId, name: "Unknown", email: "" },
      }));
    }),

  sendMessage: protectedProcedure
    .input(z.object({ conversationId: z.string(), body: z.string().min(1).max(4000), skipGopher: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const participation = await db
        .select()
        .from(directlyParticipants)
        .where(and(eq(directlyParticipants.conversationId, input.conversationId), eq(directlyParticipants.userId, ctx.user.id)))
        .limit(1);

      if (participation.length === 0) {
        await db.insert(directlyParticipants).values({
          id: randomUUID(), conversationId: input.conversationId, userId: ctx.user.id, joinedAt: new Date(), lastReadAt: new Date(),
        });
      }

      const conv = await db.select().from(directlyConversations).where(eq(directlyConversations.id, input.conversationId)).limit(1);
      const isGopherDm = conv[0]?.type === "gopher_dm";

      if (!input.skipGopher && !isGopherDm) {
        // ── GENIUS: Context counts for Gopher interception ──
        const [orderCount] = await Promise.all([
          db.select({ count: sql<number>`COUNT(*)` }).from(orderTracking),
        ]);

        const classification = await classifyGopherIntent(input.body, {
          orderCount: Number(orderCount[0]?.count ?? 0),
          lowStockCount: 0,
        });

        if (classification.shouldIntercept && classification.confidence >= 70) {
          await db.insert(directlyGopherLogs).values({
            id: randomUUID(),
            conversationId: input.conversationId,
            userId: ctx.user.id,
            questionCategory: classification.category,
            confidence: classification.confidence,
            accepted: null,
            walkthroughShown: classification.walkthroughId || null,
            repeatCount: 0,
          });

          return {
            messageId: null as string | null,
            intercepted: true,
            gopher: {
              answer: classification.answer,
              category: classification.category,
              confidence: classification.confidence,
              walkthroughId: classification.walkthroughId,
              tone: classification.tone,
            },
          };
        }
      }

      const msgId = randomUUID();
      await db.insert(directlyMessages).values({
        id: msgId,
        conversationId: input.conversationId,
        senderId: ctx.user.id,
        body: input.body,
        isGopherMessage: false,
        createdAt: new Date(),
      });

      if (isGopherDm) {
        const gopherAnswer = await handleGopherDmQuery(input.body, {
          currentDate: new Date().toISOString().split("T")[0],
          // ── GENIUS: Add live context here (e.g. unallocated order count) ──
        });

        const gopherMsgId = randomUUID();
        await db.insert(directlyMessages).values({
          id: gopherMsgId,
          conversationId: input.conversationId,
          senderId: GOPHER_SENDER_ID,
          body: gopherAnswer,
          isGopherMessage: true,
          createdAt: new Date(Date.now() + 1),
        });
      }

      await db.update(directlyConversations).set({ updatedAt: new Date() }).where(eq(directlyConversations.id, input.conversationId));
      return { messageId: msgId, intercepted: false, gopher: null };
    }),

  markRead: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: true };
      await db
        .update(directlyParticipants)
        .set({ lastReadAt: new Date() })
        .where(and(eq(directlyParticipants.conversationId, input.conversationId), eq(directlyParticipants.userId, ctx.user.id)));
      return { ok: true };
    }),

  listUsers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(ne(users.id, ctx.user.id));
  }),

  updatePresence: protectedProcedure
    .input(z.object({
      status: z.enum(["online", "away", "offline"]),
      currentApp: z.string().optional(),
      statusMessage: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: true };

      const existing = await db.select().from(directlyPresence).where(eq(directlyPresence.userId, ctx.user.id)).limit(1);

      if (existing.length === 0) {
        await db.insert(directlyPresence).values({
          id: randomUUID(),
          userId: ctx.user.id,
          status: input.status,
          lastSeenAt: new Date(),
          currentApp: input.currentApp ?? "genius",
          statusMessage: input.statusMessage,
        });
      } else {
        await db.update(directlyPresence).set({
          status: input.status,
          lastSeenAt: new Date(),
          currentApp: input.currentApp ?? "genius",
          statusMessage: input.statusMessage,
        }).where(eq(directlyPresence.userId, ctx.user.id));
      }
      return { ok: true };
    }),

  gopherAccept: protectedProcedure
    .input(z.object({ conversationId: z.string(), answer: z.string(), walkthroughId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const msgId = randomUUID();
      await db.insert(directlyMessages).values({
        id: msgId, conversationId: input.conversationId, senderId: GOPHER_SENDER_ID,
        body: input.answer, isGopherMessage: true, createdAt: new Date(),
      });

      await db.update(directlyConversations).set({ updatedAt: new Date() }).where(eq(directlyConversations.id, input.conversationId));
      await db.update(directlyGopherLogs).set({ accepted: true, walkthroughShown: input.walkthroughId ?? null })
        .where(and(eq(directlyGopherLogs.conversationId, input.conversationId), eq(directlyGopherLogs.userId, ctx.user.id), sql`${directlyGopherLogs.accepted} IS NULL`));

      const walkthrough = input.walkthroughId ? getWalkthrough(input.walkthroughId) : null;
      return { messageId: msgId, walkthrough };
    }),

  gopherReject: protectedProcedure
    .input(z.object({ conversationId: z.string(), originalMessage: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const msgId = randomUUID();
      await db.insert(directlyMessages).values({
        id: msgId, conversationId: input.conversationId, senderId: ctx.user.id,
        body: input.originalMessage, isGopherMessage: false, createdAt: new Date(),
      });

      await db.update(directlyConversations).set({ updatedAt: new Date() }).where(eq(directlyConversations.id, input.conversationId));
      await db.update(directlyGopherLogs).set({ accepted: false })
        .where(and(eq(directlyGopherLogs.conversationId, input.conversationId), eq(directlyGopherLogs.userId, ctx.user.id), sql`${directlyGopherLogs.accepted} IS NULL`));

      return { messageId: msgId };
    }),

  gopherQuery: protectedProcedure
    .input(z.object({ conversationId: z.string(), message: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const userMsgId = randomUUID();
      await db.insert(directlyMessages).values({
        id: userMsgId, conversationId: input.conversationId, senderId: ctx.user.id,
        body: input.message, isGopherMessage: false, createdAt: new Date(),
      });

      // ── GENIUS: Live context queries for Gopher DM ──────────────────────
      const [orderStats] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)` }).from(orderTracking),
      ]);

      const gopherAnswer = await handleGopherDmQuery(input.message, {
        totalOrders: Number(orderStats[0]?.count ?? 0),
        currentDate: new Date().toISOString().split("T")[0],
        availablePages: ["/allocation", "/receiving", "/put-away", "/run-history", "/clients", "/inventory", "/shipments", "/qc-scan"],
      });

      const gopherMsgId = randomUUID();
      await db.insert(directlyMessages).values({
        id: gopherMsgId, conversationId: input.conversationId, senderId: GOPHER_SENDER_ID,
        body: gopherAnswer, isGopherMessage: true, createdAt: new Date(Date.now() + 1),
      });

      await db.update(directlyConversations).set({ updatedAt: new Date() }).where(eq(directlyConversations.id, input.conversationId));
      return { userMessageId: userMsgId, gopherMessageId: gopherMsgId, answer: gopherAnswer };
    }),

  totalUnread: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };
    const participations = await db
      .select({ conversationId: directlyParticipants.conversationId, lastReadAt: directlyParticipants.lastReadAt })
      .from(directlyParticipants)
      .where(eq(directlyParticipants.userId, ctx.user.id));

    if (participations.length === 0) return { count: 0 };

    let total = 0;
    for (const p of participations) {
      const unread = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(directlyMessages)
        .where(and(
          eq(directlyMessages.conversationId, p.conversationId),
          sql`${directlyMessages.createdAt} > ${p.lastReadAt}`,
          ne(directlyMessages.senderId, ctx.user.id),
          sql`${directlyMessages.deletedAt} IS NULL`
        ));
      total += Number(unread[0]?.count ?? 0);
    }
    return { count: total };
  }),

  searchMessages: protectedProcedure
    .input(z.object({ query: z.string().min(2).max(200), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const participations = await db
        .select({ conversationId: directlyParticipants.conversationId })
        .from(directlyParticipants)
        .where(eq(directlyParticipants.userId, ctx.user.id));

      if (participations.length === 0) return [];

      const convIds = participations.map((p) => p.conversationId);
      const escaped = input.query.replace(/[%_\\]/g, "\\$&");
      const searchPattern = `%${escaped}%`;

      const matches = await db
        .select({
          messageId: directlyMessages.id,
          conversationId: directlyMessages.conversationId,
          senderId: directlyMessages.senderId,
          body: directlyMessages.body,
          isGopherMessage: directlyMessages.isGopherMessage,
          createdAt: directlyMessages.createdAt,
          senderName: users.name,
          senderEmail: users.email,
        })
        .from(directlyMessages)
        .innerJoin(users, eq(directlyMessages.senderId, users.id))
        .where(and(
          inArray(directlyMessages.conversationId, convIds),
          like(directlyMessages.body, searchPattern),
          sql`${directlyMessages.deletedAt} IS NULL`
        ))
        .orderBy(desc(directlyMessages.createdAt))
        .limit(input.limit);

      if (matches.length === 0) return [];

      const matchedConvIds = Array.from(new Set(matches.map((m) => m.conversationId)));
      const conversations = await db
        .select({ id: directlyConversations.id, type: directlyConversations.type, name: directlyConversations.name, entityType: directlyConversations.entityType, entityId: directlyConversations.entityId })
        .from(directlyConversations)
        .where(inArray(directlyConversations.id, matchedConvIds));

      const convMap = new Map(conversations.map((c) => [c.id, c]));

      return matches.map((m) => {
        const conv = convMap.get(m.conversationId);
        return {
          messageId: m.messageId,
          conversationId: m.conversationId,
          conversationName: conv?.name ?? null,
          conversationType: conv?.type ?? "dm",
          entityType: conv?.entityType ?? null,
          entityId: conv?.entityId ?? null,
          senderId: m.senderId,
          senderName: m.senderName ?? "Unknown",
          senderEmail: m.senderEmail ?? "",
          body: m.body,
          isGopherMessage: m.isGopherMessage,
          createdAt: m.createdAt,
        };
      });
    }),
});

// ---------------------------------------------------------------------------
// ── GENIUS: Walkthrough definitions ────────────────────────────────────────
// Each walkthrough maps to a step-by-step guide shown in the Gopher intercept
// card. Adapt paths and descriptions to match Genius's actual routes and UI.
// ---------------------------------------------------------------------------

interface WalkthroughStep { title: string; description: string; path?: string; }
interface Walkthrough { id: string; title: string; steps: WalkthroughStep[]; }

function getWalkthrough(id: string): Walkthrough | null {
  const walkthroughs: Record<string, Walkthrough> = {
    nav_allocate_orders: {
      id: "nav_allocate_orders",
      title: "How to Allocate Orders",
      steps: [
        { title: "Select a client", description: "Click **Clients** in the sidebar and choose the client whose orders you want to allocate.", path: "/clients" },
        { title: "Review unallocated orders", description: "The order list shows all unallocated orders. Use **Select All** or pick individual orders." },
        { title: "Run allocation", description: "Click **Allocate Selected**. Genius applies FEFO and location priority rules automatically." },
        { title: "Review and confirm", description: "Review the proposed allocation. Accept, change individual lines, or cancel before confirming." },
      ],
    },
    nav_receiving_dashboard: {
      id: "nav_receiving_dashboard",
      title: "How to Use the Receiving Dashboard",
      steps: [
        { title: "Open Receiving", description: "Click **Receiving** in the sidebar.", path: "/receiving" },
        { title: "Find your receipt", description: "Receipts are sorted by warehouse. Locate the open receipt by reference number or expected date." },
        { title: "Start the receipt", description: "Click the receipt row to view details, then click **Start Receipt** to begin processing." },
      ],
    },
    nav_put_away_wizard: {
      id: "nav_put_away_wizard",
      title: "How to Run the Put Away Wizard",
      steps: [
        { title: "Open Put Away", description: "Click **Put Away** in the sidebar.", path: "/put-away" },
        { title: "Select pallets", description: "Choose the pallets to put away. The wizard reviews open locations near existing client material." },
        { title: "Review suggestions", description: "Accept all suggestions, accept individually, or reject specific lines before confirming." },
        { title: "Confirm", description: "Confirm the put-away plan. Genius moves items in Extensiv or generates a scan list for the operator." },
      ],
    },
    nav_run_history: {
      id: "nav_run_history",
      title: "How to View Allocation Run History",
      steps: [
        { title: "Open Run History", description: "Click **Run History** in the sidebar.", path: "/run-history" },
        { title: "Find your run", description: "Each row shows the transaction ID, client, and timestamp. Click **View** to see the full allocation detail." },
        { title: "Print documents", description: "Click **Print Documents** (green = not yet printed, red = previously printed) to print the pick face pull list, warehouse pull list, and pack list." },
      ],
    },
    nav_print_documents: {
      id: "nav_print_documents",
      title: "How to Print Pull Lists and Pack Lists",
      steps: [
        { title: "Go to Run History", description: "Click **Run History** in the sidebar.", path: "/run-history" },
        { title: "Find the run", description: "Locate the allocation run by transaction ID or client name." },
        { title: "Click Print Documents", description: "The button is green if documents have not been printed yet, red if they have. Click it to print the pick face pull list, warehouse pull list, and pack list." },
      ],
    },
    nav_qc_scan: {
      id: "nav_qc_scan",
      title: "How to Use QC Scan and Label",
      steps: [
        { title: "Open QC Scan", description: "Click **QC Scan** in the sidebar.", path: "/qc-scan" },
        { title: "Scan cartons", description: "Scan each carton on the automated line. Genius retrieves the retailer label from the designated folder." },
        { title: "Apply labels", description: "Labels are sent to the print-and-apply machine automatically." },
      ],
    },
    nav_client_selection: {
      id: "nav_client_selection",
      title: "How to Select a Client",
      steps: [
        { title: "Open Clients", description: "Click **Clients** in the sidebar.", path: "/clients" },
        { title: "Choose a client", description: "Clients are listed alphabetically. The number in brackets shows unallocated orders. Click a client to open their order list." },
      ],
    },
    nav_reorder_rules: {
      id: "nav_reorder_rules",
      title: "How to Configure Auto-Run and Allocation Rules",
      steps: [
        { title: "Open Settings", description: "Click **Settings** in the sidebar.", path: "/settings" },
        { title: "Find allocation rules", description: "Locate the Auto-Run section. Toggle auto-run on or off per order or per client." },
        { title: "Save", description: "Click **Save** to apply the rule changes." },
      ],
    },
    nav_fefo_rules: {
      id: "nav_fefo_rules",
      title: "How FEFO and Location Priority Rules Work",
      steps: [
        { title: "FEFO (First Expired, First Out)", description: "Genius allocates inventory by expiry date — the soonest-to-expire stock is picked first. For items without an expiry date, the oldest received (lowest receive item ID) is used." },
        { title: "Location priority", description: "Staging locations (ACR-Staging) are preferred over general warehouse locations. Pick face locations are used before bulk storage." },
        { title: "Partial allocation", description: "Genius will not partially allocate an order. If full inventory is not available, the order is skipped." },
      ],
    },
    nav_export_documents: {
      id: "nav_export_documents",
      title: "How to Export PDF Pull Lists and Pack Lists",
      steps: [
        { title: "Go to Run History", description: "Click **Run History** in the sidebar.", path: "/run-history" },
        { title: "Open a run", description: "Click **View** on the run you want to export." },
        { title: "Export PDF", description: "Click **Export PDF** to download the pull list and pack list as a PDF document." },
      ],
    },
  };

  return walkthroughs[id] ?? null;
}
