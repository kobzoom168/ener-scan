/**
 * Knowledge base entries for the consult brain (sql/036_kb_entries.sql).
 * Active entries are cached in-memory (TTL) — the KB is read on every consult
 * reply, and entries change rarely (admin edits).
 */
import { supabase } from "../config/supabase.js";

const CACHE_TTL_MS = 60_000;
let _cache = { at: 0, rows: /** @type {any[]} */ ([]) };

/** All active entries (cached ~60s). Returns [] when the table is missing (e.g. prod before migration). */
export async function listActiveKbEntries() {
  const now = Date.now();
  if (now - _cache.at < CACHE_TTL_MS) return _cache.rows;
  try {
    const { data, error } = await supabase
      .from("kb_entries")
      .select("id, entry_type, title, question_patterns, answer, tags, status")
      .eq("status", "active")
      .limit(500);
    if (error) throw error;
    _cache = { at: now, rows: Array.isArray(data) ? data : [] };
  } catch {
    _cache = { at: now, rows: [] };
  }
  return _cache.rows;
}

export function invalidateKbCache() {
  _cache = { at: 0, rows: [] };
}

/** Admin: all entries incl. disabled, newest first. */
export async function listKbEntriesForAdmin() {
  const { data, error } = await supabase
    .from("kb_entries")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Admin: create; returns the row. */
export async function createKbEntry({ entryType, title, questionPatterns, answer, tags }) {
  const { data, error } = await supabase
    .from("kb_entries")
    .insert({
      entry_type: entryType === "faq" ? "faq" : "knowledge",
      title: String(title || "").trim().slice(0, 200),
      question_patterns: String(questionPatterns || "").trim().slice(0, 2000),
      answer: String(answer || "").trim().slice(0, 4000),
      tags: String(tags || "").trim().slice(0, 400),
      source: "manual",
    })
    .select()
    .single();
  if (error) throw error;
  invalidateKbCache();
  return data;
}

/** Admin: update fields on an entry. */
export async function updateKbEntry(id, patch) {
  const upd = {};
  if (patch.entryType != null) upd.entry_type = patch.entryType === "faq" ? "faq" : "knowledge";
  if (patch.title != null) upd.title = String(patch.title).trim().slice(0, 200);
  if (patch.questionPatterns != null) upd.question_patterns = String(patch.questionPatterns).trim().slice(0, 2000);
  if (patch.answer != null) upd.answer = String(patch.answer).trim().slice(0, 4000);
  if (patch.tags != null) upd.tags = String(patch.tags).trim().slice(0, 400);
  if (patch.status != null) upd.status = patch.status === "disabled" ? "disabled" : "active";
  const { error } = await supabase.from("kb_entries").update(upd).eq("id", String(id));
  if (error) throw error;
  invalidateKbCache();
}

/** Admin: hard delete. */
export async function deleteKbEntry(id) {
  const { error } = await supabase.from("kb_entries").delete().eq("id", String(id));
  if (error) throw error;
  invalidateKbCache();
}
