/** Фоновый обработчик задач: позиции → формула 2+1+1 → Excel.
 *  v2: retry-логика (3 попытки), graceful shutdown, exponential backoff.
 */
import { getDb } from "../queries/connection";
import { jobs, jobItems } from "@db/schema";
import { eq, asc } from "drizzle-orm";
import { processItem } from "./agent";
import { buildWorkbook } from "./excel";
import type { ItemResult } from "./types";

const running = new Set<number>();
let shuttingDown = false;

/** Количество параллельных воркеров */
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "3");

/** Задержка между retry (мс) */
const RETRY_DELAYS = [1000, 3000, 5000];

/** Максимальное число retry на позицию */
const MAX_RETRIES = 3;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Пометить задачу как failed */
async function failJob(jobId: number, error: string) {
  const db = getDb();
  await db
    .update(jobs)
    .set({
      status: "failed",
      error: error.slice(0, 2000),
      finishedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

async function processOneItem(
  item: { id: number; num: number; name: string },
  jobId: number,
): Promise<ItemResult> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (shuttingDown) {
      return {
        num: item.num,
        name: item.name,
        price1: null,
        price2: null,
        analogOther: null,
        analogSame: null,
        recommendation: "none",
        comment: "Обработка прервана: сервер завершает работу.",
        date: new Date().toISOString().slice(0, 10),
        issues: [{ level: "warn", message: "Прервано graceful shutdown" }],
      };
    }
    try {
      return await processItem(item.num, item.name);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn(`[worker] job=${jobId} item=${item.num} attempt=${attempt + 1}/${MAX_RETRIES} error: ${errMsg}`);
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt] ?? 5000);
      }
    }
  }
  return {
    num: item.num,
    name: item.name,
    price1: null,
    price2: null,
    analogOther: null,
    analogSame: null,
    recommendation: "none",
    comment: `Не удалось обработать после ${MAX_RETRIES} попыток.`,
    date: new Date().toISOString().slice(0, 10),
    issues: [{ level: "fail", message: `Не удалось обработать после ${MAX_RETRIES} попыток` }],
  };
}

async function runJob(jobId: number) {
  const db = getDb();

  await db
    .update(jobs)
    .set({ status: "processing" })
    .where(eq(jobs.id, jobId));

  const items = await db
    .select()
    .from(jobItems)
    .where(eq(jobItems.jobId, jobId))
    .orderBy(asc(jobItems.num));

  if (!items.length) {
    await failJob(jobId, "Задача не содержит позиций");
    return;
  }

  const results: (ItemResult | null)[] = new Array(items.length).fill(null);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      if (shuttingDown) break;
      const idx = cursor++;
      const item = items[idx];

      await db
        .update(jobItems)
        .set({ status: "processing" })
        .where(eq(jobItems.id, item.id));

      const r = await processOneItem(item, jobId);
      results[idx] = r;

      const status = r.issues.some((i) => i.level === "fail") ? "failed" : "done";
      await db
        .update(jobItems)
        .set({ status, result: JSON.stringify(r) })
        .where(eq(jobItems.id, item.id));

      done++;
      await db.update(jobs).set({ doneCount: done }).where(eq(jobs.id, jobId));
    }
  }

  // Запускаем воркеры
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (shuttingDown) {
    console.log(`[worker] job=${jobId} interrupted by shutdown`);
    return;
  }

  // Собираем Excel
  const validResults = results.filter((r): r is ItemResult => r !== null);
  try {
    const { base64, summary } = await buildWorkbook(validResults);
    await db
      .update(jobs)
      .set({
        status: "done",
        resultFile: base64,
        summary: JSON.stringify(summary),
        finishedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
    console.log(`[worker] job=${jobId} done. items=${items.length}, fails=${summary.fails}, warns=${summary.warns}`);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(`[worker] job=${jobId} excel build failed: ${err}`);
    await failJob(jobId, `Ошибка сборки Excel: ${err}`);
  }
}

/** Запустить обработку задачи в фоне (in-process). */
export function startJob(jobId: number) {
  if (running.has(jobId)) return;
  running.add(jobId);
  setImmediate(() => {
    runJob(jobId)
      .catch(async (e) => {
        console.error(`[worker] job=${jobId} fatal error:`, e);
        await failJob(jobId, e instanceof Error ? e.message : String(e));
      })
      .finally(() => running.delete(jobId));
  });
}

/** Graceful shutdown: дождаться завершения текущих задач. */
export async function shutdownWorkers(timeoutMs = 30_000) {
  shuttingDown = true;
  console.log(`[worker] shutdown initiated, ${running.size} jobs running...`);

  const start = Date.now();
  while (running.size > 0 && Date.now() - start < timeoutMs) {
    await sleep(500);
  }

  if (running.size > 0) {
    console.warn(`[worker] ${running.size} jobs did not finish in time, forcing exit`);
  } else {
    console.log("[worker] all jobs finished gracefully");
  }
}
