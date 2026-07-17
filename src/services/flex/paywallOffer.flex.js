/**
 * Flex paywall การ์ดโปรทั้งร้าน (กบ 17 ก.ค. 2026: "เอา flex + reply") —
 * โควตาฟรีหมด → การ์ดพื้นขาวคาดทอง (สุภาพ ไม่เด่นแข่งการ์ดรายงาน) โชว์ทุกแพ็ก + ปุ่มจ่ายในการ์ด
 * ราคา/จำนวน/อายุดึงจาก offer สด ๆ — เปลี่ยนโปรที่ /admin/promo การ์ดตามเอง
 */
import { listActivePackages, getDefaultPackage } from "../scanOffer.packages.js";
import { formatOfferWindowThai } from "../../utils/webhookText.util.js";

/**
 * ชื่อแพ็กจาก label ใน config: ตัด "29 บาท " หน้า + "1 ครั้ง / 24 ชม." ท้ายออก
 * เหลือชื่อเรียกสั้น ๆ (บรรทัดเดียวไม่ตัดคำ) — รายละเอียดครั้ง/อายุแยกไปบรรทัดรอง
 */
function packageDisplayName(p) {
  const label = String(p?.label || "").trim();
  const stripped = label
    .replace(/^\d+\s*บาท\s*/, "")
    .replace(/\s*\d+\s*ครั้ง.*$/, "")
    .trim();
  return stripped || "แพ็กสแกน";
}

/** บรรทัดรอง: "4 ครั้ง · 24 ชม." / "30 ครั้ง · 30 วัน" */
function packageDetailLine(p) {
  return `${p.scanCount} ครั้ง · ${formatOfferWindowThai(p.windowHours)}`;
}

/**
 * @param {import("../scanOffer.loader.js").NormalizedScanOffer} offer
 * @param {{ altText?: string }} [opts]
 * @returns {object|null} LINE flex message (null เมื่อไม่มีแพ็กเปิดขาย)
 */
export function buildFreeQuotaPaywallFlex(offer, opts = {}) {
  const pkgs = listActivePackages(offer)
    .slice()
    .sort((a, b) => a.priceThb - b.priceThb);
  if (!pkgs.length) return null;
  const defKey = getDefaultPackage(offer)?.key ?? null;

  const rows = pkgs.map((p) => {
    const isDefault = p.key === defKey;
    return {
      type: "box",
      layout: "horizontal",
      paddingAll: "12px",
      cornerRadius: "14px",
      backgroundColor: isDefault ? "#FFF8E7" : "#FAF9F6",
      borderWidth: "1px",
      borderColor: isDefault ? "#D4AF37" : "#E8E4DC",
      alignItems: "center",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 6,
          spacing: "none",
          contents: [
            {
              type: "text",
              text: `${isDefault ? "⭐ " : ""}${packageDisplayName(p)}`,
              size: "md",
              weight: "bold",
              color: isDefault ? "#8F6710" : "#33302B",
            },
            {
              type: "text",
              text: isDefault
                ? `${packageDetailLine(p)} · คนเลือกมากที่สุด`
                : packageDetailLine(p),
              size: "xs",
              color: isDefault ? "#A4813A" : "#8A857C",
              margin: "xs",
            },
          ],
        },
        {
          type: "text",
          text: `${p.priceThb}.-`,
          flex: 2,
          size: "xl",
          weight: "bold",
          align: "end",
          gravity: "center",
          color: isDefault ? "#B8871B" : "#241C12",
        },
      ],
      action: { type: "message", label: `จ่าย ${p.priceThb}`, text: `จ่าย ${p.priceThb}` },
    };
  });

  const def = pkgs.find((p) => p.key === defKey) || pkgs[0];
  const others = pkgs.filter((p) => p !== def);

  const altText =
    String(opts.altText || "").trim() ||
    `วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ เปิดสิทธิ์ต่อได้ ${pkgs
      .map((p) => `${p.priceThb} บาท`)
      .join(" / ")}`;

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
                text: "วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ ✨",
                weight: "bold",
                size: "lg",
                color: "#241C12",
                wrap: true,
              },
              {
                type: "text",
                text: "เปิดพลังต่อได้เลยวันนี้ หรือพรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีกครับ",
                size: "xs",
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
            action: {
              type: "message",
              label: `จ่าย ${def.priceThb} เปิดเลย`,
              text: `จ่าย ${def.priceThb}`,
            },
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
                    action: {
                      type: "message",
                      label: `จ่าย ${p.priceThb}`,
                      text: `จ่าย ${p.priceThb}`,
                    },
                  })),
                },
              ]
            : []),
        ],
      },
      styles: { footer: { separator: false } },
    },
  };
}
