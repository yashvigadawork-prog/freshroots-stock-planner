import { createDb } from "../src/db";
import { seedIfEmpty } from "../src/lib/services/seed";

createDb()
  .then((db) => seedIfEmpty(db))
  .then((did) => { console.log(did ? "Loaded the sample data and opened a review." : "Sample data is already loaded. Nothing to do."); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
