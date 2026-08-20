/**
 * Durable outbox ของรายงานคุณภาพแชทรายวัน (Codex C7 + incident 20 ส.ค. 2026)
 *
 * ปัญหาเดิม: tryDedupeOnce fail-open เมื่อ redis มีปัญหา + claim ก่อนรู้ผลส่ง —
 * ได้ทั้งรายงานซ้ำและรายงานหาย · failure notification ไม่มี idempotency
 *
 * กติกาใหม่ (ทั้งไฟล์ DI ล้วน ทดสอบได้โดยไม่แตะ DB/redis จริง):
 * - lease ต่อ reportDateTH: instance เดียวทำงานต่อรอบ · lease ไม่ได้ (ถูกถือ/redis
 *   พัง) = ข้ามรอบนี้ ไม่เดา (fail-closed) — รอบถัดไปของ worker ลองใหม่เอง
 * - sent marker ต่อ chunk ต่อ channel เขียน "หลัง" delivery สำเร็จเท่านั้น ·
 *   partial failure = รอบถัดไปส่งเฉพาะ chunk/channel ที่ขาด · ครบทุกช่อง = finalized
 * - finalized แล้ว = จบถาวรของวันนั้น รันซ้ำกี่รอบก็ไม่ส่งซ้ำ (reportDateTH เดิม)
 * - failure notification: key ต่อ failureType — ส่งเมื่อ (1) ยังไม่เคยส่งสำเร็จ
 *   (delivery เดิมล้ม = retry ข้อความเดิม attempt เดิม) หรือ (2) attempt ขยับเกิน
 *   renotifyEveryAttempts จากครั้งล่าสุดที่ส่งสำเร็จ (แจ้งใหม่พร้อมระบุ attempt)
 */

/**
 * @param {{
 *   reportDateTH: string,
 *   loadOutbox: () => Promise<object|null>,
 *   saveOutbox: (ob: object) => Promise<void>,
 *   acquireLease: () => Promise<string|null>,
 *   releaseLease: (token: string) => Promise<void>,
 *   buildBase: () => Promise<{ text: string, convCount: number, deterministicIncidents: number }>,
 *   curate: (baseText: string) => Promise<{ ok: boolean, text?: string, failureType?: string, attempts: Array<object> }>,
 *   buildDegraded: (p: { reportDateTH: string, baseText: string, convCount: number, deterministicIncidents: number, attempts: Array<object> }) => string,
 *   chunkText: (text: string) => string[],
 *   hashChunk: (text: string) => string,
 *   channels: Record<string, { enabled: boolean, send: (text: string) => Promise<{ ok: boolean, reason?: string }> }>,
 *   notify: (text: string) => Promise<{ ok: boolean, reason?: string }>,
 *   renotifyEveryAttempts?: number,
 *   nowIso?: () => string,
 *   log?: (event: string, extra: object) => void,
 * }} deps
 */
export async function runReportDeliveryCycle(deps) {
  const log = deps.log || ((event, extra) => console.log(JSON.stringify({ event, ...extra })));
  const nowIso = deps.nowIso || (() => new Date().toISOString());
  const token = await deps.acquireLease();
  if (!token) return { skipped: "lease_unavailable" };

  // Ownership ต่อเนื่อง (Codex รอบสอง): lease จริงถูก clamp 10 นาที แต่ build
  // worst-case (60 users × 25s + curator 2×45s) ~27 นาที — ต้อง renew แบบ
  // compare-token ระหว่าง cycle · renew ไม่ผ่าน = เสีย ownership ทันที ห้าม
  // save/send/finalize ต่อ (owner ใหม่อาจกำลังเขียน outbox อยู่ — last-write-wins)
  let ownershipLost = false;
  const renewIntervalMs = Number(deps.renewIntervalMs) > 0 ? Number(deps.renewIntervalMs) : 60_000;
  let renewTimer = null;
  if (deps.renewLease) {
    renewTimer = setInterval(() => {
      void Promise.resolve(deps.renewLease(token))
        .then((ok) => {
          if (!(ok === true || ok?.ok === true)) ownershipLost = true;
        })
        .catch(() => {
          ownershipLost = true;
        });
    }, renewIntervalMs);
    if (typeof renewTimer.unref === "function") renewTimer.unref();
  }
  /** เช็ค ownership ตรงจุดสำคัญ (หลัง build/curate ยาว ๆ ก่อน save/send ทุกครั้ง) */
  const ensureOwner = async () => {
    if (ownershipLost) throw new Error("lease_lost");
    if (deps.renewLease) {
      let ok = false;
      try {
        const r = await deps.renewLease(token);
        ok = r === true || r?.ok === true;
      } catch {
        ok = false;
      }
      if (!ok) {
        ownershipLost = true;
        throw new Error("lease_lost");
      }
    }
  };
  const rawSave = deps.saveOutbox;
  const guardedSave = async (ob) => {
    await ensureOwner();
    await rawSave(ob);
  };
  try {
    let ob = (await deps.loadOutbox()) || null;
    if (!ob || ob.reportDateTH !== deps.reportDateTH) {
      ob = { reportDateTH: deps.reportDateTH, attempt: 0, notifications: {}, base: null, curated: null, chunks: null, finalized: false };
    }
    if (ob.finalized) return { skipped: "finalized" };
    ob.attempt = (Number(ob.attempt) || 0) + 1;

    // 1) รายงานดิบ — สร้างครั้งเดียวต่อวัน (retry รอบถัดไปใช้ของเดิม ห้ามสร้างซ้ำ)
    if (!ob.base) {
      try {
        ob.base = await deps.buildBase();
        await guardedSave(ob);
      } catch (e) {
        if (String(e?.message) === "lease_lost") throw e;
        log("CHAT_QUALITY_BASE_BUILD_FAILED", { reportDateTH: deps.reportDateTH, attempt: ob.attempt, message: String(e?.message || e).slice(0, 160) });
        await ensureOwner(); // เสีย lease = ห้ามแม้แต่ notify (owner ใหม่จะแจ้งเอง)
        await notifyFailureOnce(ob, deps, "base_build_failed", nowIso, log);
        await guardedSave(ob).catch(() => {});
        return { failed: "base_build_failed", attempt: ob.attempt };
      }
    }

    // 2) คัดกรองตามเกณฑ์ — ล้มทุก model = degraded (รายงานยังออก ไม่นับเป็น failure)
    if (!ob.curated) {
      const cur = await deps.curate(ob.base.text);
      ob.curated = cur.ok === true
        ? { ok: true, text: cur.text, attempts: cur.attempts }
        : { ok: false, failureType: cur.failureType || "provider_error", attempts: cur.attempts };
      await guardedSave(ob);
    }
    const finalText = ob.curated.ok
      ? ob.curated.text
      : deps.buildDegraded({
          reportDateTH: deps.reportDateTH,
          baseText: ob.base.text,
          convCount: ob.base.convCount,
          deterministicIncidents: ob.base.deterministicIncidents,
          attempts: ob.curated.attempts,
        });

    // 3) chunk ครั้งเดียว (hash ผูกเนื้อหา — เนื้อหาต่อวันนิ่งเพราะ base+curated ถูก freeze แล้ว)
    if (!Array.isArray(ob.chunks)) {
      ob.chunks = deps.chunkText(finalText).map((t) => ({ hash: deps.hashChunk(t), text: t, delivery: {} }));
      await guardedSave(ob);
    }

    // 4) ส่งเฉพาะ chunk/channel ที่ยังไม่มี sent marker — marker หลังส่งสำเร็จเท่านั้น
    let allSent = true;
    for (const [ch, cfg] of Object.entries(deps.channels || {})) {
      if (!cfg?.enabled) continue;
      for (const c of ob.chunks) {
        const st = c.delivery[ch] || { sent: false, attempts: 0 };
        if (st.sent) continue;
        st.attempts += 1;
        await ensureOwner(); // เสีย lease แล้วห้ามยิง transport (owner ใหม่กำลังทำงาน)
        let r = null;
        try {
          r = await cfg.send(c.text);
        } catch (e) {
          r = { ok: false, reason: String(e?.message || e).slice(0, 80) };
        }
        if (r?.ok === true) {
          st.sent = true;
          st.at = nowIso();
        } else {
          st.lastReason = String(r?.reason || "send_failed");
          allSent = false;
        }
        c.delivery[ch] = st;
        // at-least-once: marker เขียนหลังส่งสำเร็จ — ถ้า process crash หลัง Telegram
        // รับข้อความแต่ก่อน save marker รอบถัดไปจะส่ง chunk นั้นซ้ำได้ (Telegram ไม่มี
        // idempotency key ให้ใช้) — residual risk ที่ยอมรับ ห้าม claim exactly-once
        await guardedSave(ob);
        if (!st.sent) break; // รักษาลำดับ chunk ในช่องนี้ รอบถัดไปต่อจากตัวที่ค้าง
      }
    }

    if (allSent) {
      ob.finalized = true;
      ob.finalizedAt = nowIso();
      await guardedSave(ob);
    }
    log("CHAT_QUALITY_DELIVERY_CYCLE", {
      reportDateTH: deps.reportDateTH,
      attempt: ob.attempt,
      degraded: ob.curated.ok !== true,
      curateFailureType: ob.curated.ok === true ? null : ob.curated.failureType,
      chunks: ob.chunks.length,
      finalized: ob.finalized === true,
    });
    return { sent: allSent, degraded: ob.curated.ok !== true, attempt: ob.attempt, chunks: ob.chunks.length };
  } catch (e) {
    if (String(e?.message) === "lease_lost") {
      log("CHAT_QUALITY_LEASE_LOST", { reportDateTH: deps.reportDateTH });
      return { failed: "lease_lost" };
    }
    throw e;
  } finally {
    if (renewTimer) clearInterval(renewTimer);
    await Promise.resolve(deps.releaseLease(token)).catch(() => {});
  }
}

/**
 * แจ้งเตือน failure แบบ idempotent ต่อ {reportDateTH, attempt, failureType}
 * - delivery เดิมล้ม → retry ข้อความ attempt เดิม (ไม่นับเป็นแจ้งใหม่)
 * - ส่งสำเร็จแล้ว → แจ้งซ้ำได้เมื่อ attempt ขยับ ≥ renotifyEveryAttempts (ระบุ attempt ใหม่)
 */
async function notifyFailureOnce(ob, deps, failureType, nowIso, log) {
  const renotifyEvery = Number(deps.renotifyEveryAttempts) > 0 ? Number(deps.renotifyEveryAttempts) : 30;
  ob.notifications = ob.notifications || {};
  const n = ob.notifications[failureType] || { sent: false, attempt: 0 };
  const isRetryOfFailedDelivery = n.attempt > 0 && n.sent !== true;
  const isNewAttemptDue = n.sent === true && ob.attempt >= n.attempt + renotifyEvery;
  const isFirst = n.attempt === 0;
  if (!isFirst && !isRetryOfFailedDelivery && !isNewAttemptDue) return { skipped: true };
  const attemptLabel = isRetryOfFailedDelivery ? n.attempt : ob.attempt;
  if (!isRetryOfFailedDelivery) n.attempt = ob.attempt;
  let r = null;
  try {
    r = await deps.notify(
      `⚠️ รายงานคุณภาพแชท ${deps.reportDateTH} ล้ม (attempt ${attemptLabel}: ${failureType}) — ระบบจะ retry รอบถัดไปเอง`,
    );
  } catch (e) {
    r = { ok: false, reason: String(e?.message || e).slice(0, 80) };
  }
  if (r?.ok === true) {
    n.sent = true;
    n.at = nowIso();
  } else {
    n.sent = false; // delivery ล้ม = รอบถัดไป retry ข้อความเดิม
  }
  ob.notifications[failureType] = n;
  log("CHAT_QUALITY_FAILURE_NOTIFY", { reportDateTH: deps.reportDateTH, failureType, attempt: attemptLabel, delivered: r?.ok === true });
  return { delivered: r?.ok === true };
}
