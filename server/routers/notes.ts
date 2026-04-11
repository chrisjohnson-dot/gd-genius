import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { entityNotes, entityNoteMentions, users } from "../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
async function db(): Promise<Db> {
  const d = await getDb();
  if (!d) throw new Error("DB unavailable");
  return d;
}

export const notesRouter = router({
  // List notes for an entity (chronological)
  list: publicProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const d = await db();
      const notes = await d
        .select()
        .from(entityNotes)
        .where(
          and(
            eq(entityNotes.entityType, input.entityType),
            eq(entityNotes.entityId, input.entityId)
          )
        )
        .orderBy(entityNotes.createdAt);
      return notes;
    }),

  // Add a note (with optional @mentions)
  add: protectedProcedure
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
        noteType: z.enum(["internal", "client", "system", "decision"]).default("internal"),
        bodyText: z.string().min(1).max(4000),
        mentionedUserIds: z.array(z.number()).default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      const [result] = await d.insert(entityNotes).values({
        entityType: input.entityType,
        entityId: input.entityId,
        noteType: input.noteType,
        authorId: ctx.user.id,
        authorName: ctx.user.name ?? ctx.user.email ?? "Unknown",
        bodyText: input.bodyText,
      });
      const noteId = (result as any).insertId as number;

      // Create mention records
      if (input.mentionedUserIds.length > 0) {
        await d.insert(entityNoteMentions).values(
          input.mentionedUserIds.map((uid) => ({
            noteId,
            mentionedUserId: uid,
          }))
        );
        await notifyOwner({
          title: `You were mentioned in a note`,
          content: `${ctx.user.name ?? "Someone"} mentioned you on ${input.entityType} ${input.entityId}: "${input.bodyText.slice(0, 100)}"`,
        }).catch(() => {});
      }

      const [note] = await d
        .select()
        .from(entityNotes)
        .where(eq(entityNotes.id, noteId));
      return note;
    }),

  // Get unread mention count for current user
  unreadMentionCount: protectedProcedure.query(async ({ ctx }) => {
    const d = await db();
    const mentions = await d
      .select()
      .from(entityNoteMentions)
      .where(
        and(
          eq(entityNoteMentions.mentionedUserId, ctx.user.id),
          isNull(entityNoteMentions.readAt)
        )
      );
    return { count: mentions.length };
  }),

  // Mark a mention as read
  markMentionRead: protectedProcedure
    .input(z.object({ noteId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const d = await db();
      await d
        .update(entityNoteMentions)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(entityNoteMentions.noteId, input.noteId),
            eq(entityNoteMentions.mentionedUserId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  // List all users for @mention picker
  listUsers: protectedProcedure.query(async () => {
    const d = await db();
    const allUsers = await d
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users);
    return allUsers;
  }),
});

// Helper: add a system note from server-side code (not via tRPC)
export async function addSystemNote(
  entityType: string,
  entityId: string,
  bodyText: string
): Promise<void> {
  const d = await db();
  await d.insert(entityNotes).values({
    entityType,
    entityId,
    noteType: "system",
    authorId: null,
    authorName: "System",
    bodyText,
  });
}
