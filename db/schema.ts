import {
  mysqlTable,
  mysqlEnum,
  serial,
  varchar,
  text,
  longtext,
  bigint,
  int,
  timestamp,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── PriceHunter ────────────────────────────────────────────────────────────

/** Тарифные планы. free: 3 задачи, до 10 позиций. pro/business — без жёстких лимитов. */
export const plans = mysqlTable("plans", {
  userId: bigint("userId", { mode: "number", unsigned: true })
    .primaryKey()
    .notNull(),
  plan: mysqlEnum("plan", ["free", "pro", "business"])
    .default("free")
    .notNull(),
  usedTasks: int("usedTasks").default(0).notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type Plan = typeof plans.$inferSelect;

export const jobs = mysqlTable("jobs", {
  id: serial("id").primaryKey(),
  userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["text", "excel"]).notNull(),
  status: mysqlEnum("status", ["queued", "processing", "done", "failed"])
    .default("queued")
    .notNull(),
  itemCount: int("itemCount").default(0).notNull(),
  doneCount: int("doneCount").default(0).notNull(),
  error: text("error"),
  /** Итоговый Excel (xlsx) в base64 */
  resultFile: longtext("resultFile"),
  /** Сводка по задаче: экономия, eval-предупреждения */
  summary: text("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});
export type Job = typeof jobs.$inferSelect;

export const jobItems = mysqlTable("job_items", {
  id: serial("id").primaryKey(),
  jobId: bigint("jobId", { mode: "number", unsigned: true }).notNull(),
  num: int("num").notNull(),
  name: text("name").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "done", "failed"])
    .default("pending")
    .notNull(),
  /** JSON результата по формуле 2+1+1 */
  result: text("result"),
});
export type JobItem = typeof jobItems.$inferSelect;
