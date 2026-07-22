/**
 * โพสต์รูปขึ้นเพจ Facebook ตรง ๆ ผ่าน Graph API (แนวเดียวกับตัวโพสต์วิดีโอใน ener-ai —
 * ไม่ใช้ Postiz/n8n) — ใช้กับฟีเจอร์ auto post การ์ดอวดพระ (กบ 22 ก.ค. 2026)
 *
 * env:
 *   FB_PAGE_ID      - id เพจ Ener
 *   FB_PAGE_TOKEN   - long-lived Page Access Token (pages_manage_posts)
 *   FB_API_VERSION  - default v21.0
 */

const API_TIMEOUT_MS = 60000;

function cfg() {
  return {
    pageId: String(process.env.FB_PAGE_ID || "").trim(),
    token: String(process.env.FB_PAGE_TOKEN || "").trim(),
    version: String(process.env.FB_API_VERSION || "v21.0").trim() || "v21.0",
  };
}

export function isFbPageConfigured() {
  const { pageId, token } = cfg();
  return Boolean(pageId && token);
}

/**
 * โพสต์รูปจาก URL สาธารณะ (FB ไปดึงรูปเอง) — ใช้กับการ์ด /r/:token/card.png
 * @param {string} imageUrl
 * @param {string} caption
 * @param {{ published?: boolean }} [opts] published:false = โพสต์เงียบไว้ทดสอบ ไม่ขึ้นหน้าเพจ
 * @returns {Promise<{ ok: boolean, postId?: string, error?: string }>}
 */
export async function postPagePhotoByUrl(imageUrl, caption, opts = {}) {
  const { pageId, token, version } = cfg();
  if (!pageId || !token) return { ok: false, error: "FB_PAGE_ID/FB_PAGE_TOKEN not set" };
  const url = String(imageUrl || "").trim();
  if (!/^https:\/\//i.test(url)) return { ok: false, error: "imageUrl must be https" };
  try {
    const body = new URLSearchParams({
      url,
      caption: String(caption || "").slice(0, 5000),
      access_token: token,
    });
    if (opts.published === false) body.set("published", "false");
    const res = await fetch(`https://graph.facebook.com/${version}/${pageId}/photos`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: `FB ${res.status}: ${String(data?.error?.message || "").slice(0, 200)}`,
      };
    }
    return { ok: true, postId: String(data.post_id || data.id || "") };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}
