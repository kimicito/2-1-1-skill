import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { jobs, jobItems, plans, users } from "@db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { parseTextItems, parseExcelItems } from "./pricehunter/parseInput";
import { startJob } from "./pricehunter/worker";
import { FREE_TASKS_LIMIT, FREE_ITEMS_PER_TASK } from "@contracts/constants";
import { llmAvailable } from "./pricehunter/llm";

async function getPlan(userId: number) {
  const db = getDb();
  let p = await db.query.plans.findFirst({ where: eq(plans.userId, userId) });
  if (!p) {
    await db.insert(plans).values({ userId, plan: "free", usedTasks: 0 });
    p = await db.query.plans.findFirst({ where: eq(plans.userId, userId) });
  }
  return p!;
}

export const jobsRouter = createRouter({
  /** Текущий тариф и использование */
  quota: authedQuery.query(async ({ ctx }) => {
    const p = await getPlan(ctx.user.id);
    return {
      plan: p.plan,
      usedTasks: p.usedTasks,
      freeTasksLimit: FREE_TASKS_LIMIT,
      freeItemsPerTask: FREE_ITEMS_PER_TASK,
      engine: llmAvailable() ? "llm" : "scraper",
    };
  }),

  list: authedQuery.query(async ({ ctx }) => {
    return getDb()
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        itemCount: jobs.itemCount,
        doneCount: jobs.doneCount,
        summary: jobs.summary,
        createdAt: jobs.createdAt,
        finishedAt: jobs.finishedAt,
      })
      .from(jobs)
      .where(eq(jobs.userId, ctx.user.id))
      .orderBy(desc(jobs.createdAt))
      .limit(50);
  }),

  byId: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const job = await db.query.jobs.findFirst({
        where: eq(jobs.id, input.id),
      });
      if (!job || job.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      const items = await db
        .select({
          id: jobItems.id,
          num: jobItems.num,
          name: jobItems.name,
          status: jobItems.status,
          result: jobItems.result,
        })
        .from(jobItems)
        .where(eq(jobItems.jobId, job.id))
        .orderBy(asc(jobItems.num));
      return {
        id: job.id,
        title: job.title,
        status: job.status,
        itemCount: job.itemCount,
        doneCount: job.doneCount,
        error: job.error,
        summary: job.summary,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
        hasFile: !!job.resultFile,
        items,
      };
    }),

  /** Скачать итоговый Excel (base64) */
  download: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const job = await db.query.jobs.findFirst({
        where: eq(jobs.id, input.id),
      });
      if (!job || job.userId !== ctx.user.id)
        throw new TRPCError({ code: "NOT_FOUND" });
      if (!job.resultFile) throw new TRPCError({ code: "BAD_REQUEST", message: "Файл ещё не готов" });
      return {
        filename: `price_comparison_${job.id}.xlsx`,
        base64: job.resultFile,
      };
    }),

  create: authedQuery
    .input(
      z.object({
        title: z.string().min(1).max(200),
        sourceType: z.enum(["text", "excel"]),
        text: z.string().max(200_000).optional(),
        fileBase64: z.string().max(15_000_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const plan = await getPlan(ctx.user.id);

      if (plan.plan === "free" && plan.usedTasks >= FREE_TASKS_LIMIT) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Лимит бесплатного тарифа исчерпан (${FREE_TASKS_LIMIT} задачи). Перейдите на Pro.`,
        });
      }

      let items: string[] = [];
      if (input.sourceType === "text" && input.text) {
        items = parseTextItems(input.text);
      } else if (input.sourceType === "excel" && input.fileBase64) {
        try {
          items = parseExcelItems(input.fileBase64);
        } catch {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Не удалось прочитать Excel-файл" });
        }
      }
      if (!items.length)
        throw new TRPCError({ code: "BAD_REQUEST", message: "Не найдено ни одной позиции" });

      const maxItems = plan.plan === "free" ? FREE_ITEMS_PER_TASK : 100;
      if (items.length > maxItems)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Слишком много позиций: ${items.length}. Лимит тарифа — ${maxItems}.`,
        });

      const [{ id }] = await db
        .insert(jobs)
        .values({
          userId: ctx.user.id,
          title: input.title,
          sourceType: input.sourceType,
          itemCount: items.length,
        })
        .$returningId();

      await db.insert(jobItems).values(
        items.map((name, i) => ({ jobId: id, num: i + 1, name })),
      );
      await db
        .update(plans)
        .set({ usedTasks: plan.usedTasks + 1 })
        .where(eq(plans.userId, ctx.user.id));

      startJob(id);
      return { id, itemCount: items.length };
    }),

  /** Админ: смена тарифа пользователю */
  setPlan: adminQuery
    .input(z.object({ userId: z.number(), plan: z.enum(["free", "pro", "business"]) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .insert(plans)
        .values({ userId: input.userId, plan: input.plan })
        .onDuplicateKeyUpdate({ set: { plan: input.plan } });
      return { ok: true };
    }),

  /** Админ: список пользователей */
  users: adminQuery.query(async () => {
    return getDb()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .limit(200);
  }),
});
