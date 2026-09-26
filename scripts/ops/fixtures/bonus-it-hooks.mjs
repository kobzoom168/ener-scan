// --import hook สำหรับ integration test โบนัส: แทนที่ storage (S3) และ thumbnail (sharp) ด้วย in-memory
// ทุกอย่างอื่น (PostgREST, stores, ingestion, processScanJob, trigger) เป็นของจริง
import { register } from "node:module";
register("./bonus-it-hooks-impl.mjs", import.meta.url);
