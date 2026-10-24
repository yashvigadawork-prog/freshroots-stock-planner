import { desc } from "drizzle-orm";
import type { Db } from "@/db";
import { uploadSnapshots } from "@/db/schema";
import { asOfDateOf } from "@/lib/data/inputs";
import type { Dataset, Problem } from "@/lib/data/csv";

export async function saveSnapshot(
  db: Db,
  dataset: Dataset,
  warnings: Problem[],
  filesUploaded: string[],
  userId: string | null,
) {
  const [row] = await db
    .insert(uploadSnapshots)
    .values({
      uploadedBy: userId,
      asOfDate: asOfDateOf(dataset),
      filesUploaded,
      dataset,
      warnings: warnings.map(({ file, row, message }) => ({ file, row, message })),
    })
    .returning();
  return row;
}

export async function latestSnapshot(db: Db) {
  const [row] = await db.select().from(uploadSnapshots).orderBy(desc(uploadSnapshots.id)).limit(1);
  return row ?? null;
}
