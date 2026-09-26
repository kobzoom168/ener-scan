/**
 * Flex paywall การ์ดโปรทั้งร้าน (กบ 17 ก.ค. 2026: "เอา flex + reply") —
 * โควตาฟรีหมด → การ์ดพื้นขาวคาดทอง (สุภาพ ไม่เด่นแข่งการ์ดรายงาน) โชว์ทุกแพ็ก + ปุ่มจ่ายในการ์ด
 * ราคา/จำนวน/อายุดึงจาก offer สด ๆ — เปลี่ยนโปรที่ /admin/promo การ์ดตามเอง
 */
import { listActivePackages, getDefaultPackage } from "../scanOffer.packages.js";
import { formatOfferWindowThai } from "../../utils/webhookText.util.js";
// ชื่อแพ็ก = สิ่งที่ซื้อตรง ๆ ("สแกน 4 ครั้ง") ไม่ใช้ label การตลาดจาก config (เช่น "ค่าครูดูแลคลังพลัง"
// ที่ทำให้เข้าใจว่าต้องจ่ายถึงดูคลังเดิมได้ — กบ/Codex 26 ก.ย. 2026)
import { packageDisplayName, packageButton } from "../entitlementCopy.service.js";

/** บรรทัดรอง: "4 ครั้ง · 24 ชม." / "30 ครั้ง · 30 วัน" */
function packageDetailLine(p) {
  return `${p.scanCount} ครั้ง · ${formatOfferWindowThai(p.windowHours)}`;
}

/**
 * @param {import("../scanOffer.loader.js").NormalizedScanOffer} offer
 * @param {{ altText?: string, title?: string, subtitle?: string }} [opts]
 * @returns {object|null} LINE flex message (null เมื่อไม่มีแพ็กเปิดขาย)
 */
export function buildFreeQuotaPaywallFlex(offer, opts = {}) {
  // ค่าเริ่มต้นเป็นกลาง (ไม่พูดฟรีรายวัน/พรุ่งนี้) — ผู้เรียกส่ง title/subtitle ตามสถานะสิทธิ์จริง
  const title = String(opts.title || "").trim() || "เติมสิทธิ์เพื่อสแกนองค์ใหม่";
  const subtitle =
    String(opts.subtitle || "").trim() ||
    "เลือกแพ็กสแกนด้านล่างได้เลยครับ คลังและรายงานเดิมของคุณยังเปิดดูได้โดยไม่ต้องซื้อแพ็ก";
  const pkgs = listActivePackages(offer)
    .slice()
    .sort((a, b) => a.priceThb - b.priceThb);
  if (!pkgs.length) return null;
  const defKey = getDefaultPackage(offer)?.key ?? null;

  const rows = pkgs.map((p) => {
    const isDefault = p.key === defKey;
    const nameContents = [
      {
        type: "text",
        text: packageDisplayName(p),
        size: "sm",
        weight: "bold",
        color: isDefault ? "#8F6710" : "#33302B",
        flex: 0,
      },
    ];
    if (isDefault) {
      nameContents.push({
        type: "text",
        text: "แนะนำ",
        size: "xxs",
        weight: "bold",
        color: "#B8871B",
        align: "start",
        gravity: "center",
        margin: "sm",
        flex: 0,
      });
    }
    return {
      type: "box",
      layout: "horizontal",
      paddingAll: "10px",
      cornerRadius: "12px",
      backgroundColor: isDefault ? "#FFF8E7" : "#FAF9F6",
      borderWidth: "1px",
      borderColor: isDefault ? "#D4AF37" : "#E8E4DC",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          spacing: "none",
          contents: [
            {
              type: "box",
              layout: "baseline",
              spacing: "none",
              contents: nameContents,
            },
            {
              type: "text",
              text: packageDetailLine(p),
              size: "xxs",
              color: isDefault ? "#A4813A" : "#8A857C",
              margin: "xs",
            },
          ],
        },
        {
          type: "text",
          text: `${p.priceThb}.-`,
          flex: 2,
          size: "lg",
          weight: "bold",
          align: "end",
          gravity: "center",
          color: isDefault ? "#B8871B" : "#241C12",
        },
      ],
      action: { type: "message", ...packageButton(p) },
    };
  });

  const def = pkgs.find((p) => p.key === defKey) || pkgs[0];
  const others = pkgs.filter((p) => p !== def);

  const altText =
    String(opts.altText || "").trim() ||
    `${title} ${pkgs.map((p) => `${p.priceThb} บาท`).join(" / ")}`;

  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        paddingAll: "18px",
        spacing: "md",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "box",
            layout: "vertical",
            height: "6px",
            backgroundColor: "#D4AF37",
            cornerRadius: "12px",
            contents: [],
          },
          {
            type: "box",
            layout: "vertical",
            margin: "md",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: title,
                weight: "bold",
                size: "md",
                color: "#241C12",
                wrap: true,
              },
              {
                type: "text",
                text: subtitle,
                size: "xxs",
                color: "#7A6A58",
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "md",
            contents: rows,
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        backgroundColor: "#FFFFFF",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            color: "#D4AF37",
            action: { type: "message", ...packageButton(def) },
          },
          ...(others.length
            ? [
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  contents: others.map((p) => ({
                    type: "button",
                    style: "secondary",
                    height: "sm",
                    action: { type: "message", ...packageButton(p) },
                  })),
                },
              ]
            : []),
          ...(opts.secondaryAction?.label
            ? [{
                type: "button",
                style: "link",
                height: "sm",
                action: { type: "message", label: opts.secondaryAction.label, text: opts.secondaryAction.text },
              }]
            : []),
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "message", label: "ไว้ก่อน", text: "ไว้ก่อน" },
          },
        ],
      },
      styles: { footer: { separator: false } },
    },
  };
}
