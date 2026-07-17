/**
 * Flex paywall การ์ดโปรทั้งร้าน (กบ 17 ก.ค. 2026: "เอา flex + reply") —
 * โควตาฟรีหมด → การ์ดดำทองโชว์ทุกแพ็กจาก config + ปุ่มจ่ายในการ์ด
 * ราคา/จำนวน/อายุดึงจาก offer สด ๆ — เปลี่ยนโปรที่ /admin/promo การ์ดตามเอง
 */
import { listActivePackages, getDefaultPackage } from "../scanOffer.packages.js";
import { formatOfferWindowThai } from "../../utils/webhookText.util.js";

/** ชื่อแพ็กจาก label ใน config: ตัด "29 บาท " ข้างหน้าออก เหลือชื่อเรียก */
function packageDisplayName(p) {
  const label = String(p?.label || "").trim();
  const stripped = label.replace(/^\d+\s*บาท\s*/, "").trim();
  if (stripped) return stripped;
  return `สแกน ${p.scanCount} ครั้ง / ${formatOfferWindowThai(p.windowHours)}`;
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
      backgroundColor: isDefault ? "#1D1A14" : "#151515",
      borderWidth: "1px",
      borderColor: isDefault ? "#D4AF37" : "#262629",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          spacing: "none",
          contents: [
            {
              type: "text",
              text: `${isDefault ? "⭐ " : ""}${packageDisplayName(p)}`,
              size: "sm",
              weight: isDefault ? "bold" : "regular",
              color: isDefault ? "#F3D98B" : "#E3E3E3",
              wrap: true,
            },
            ...(isDefault
              ? [
                  {
                    type: "text",
                    text: "คนเลือกมากที่สุด",
                    size: "xxs",
                    color: "#A4906A",
                  },
                ]
              : []),
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
          color: isDefault ? "#D4AF37" : "#F8F8F8",
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
        backgroundColor: "#101010",
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
                color: "#F8F8F8",
                wrap: true,
              },
              {
                type: "text",
                text: "เปิดพลังต่อได้เลยวันนี้ หรือพรุ่งนี้หลังเที่ยงคืนมีฟรีให้อีกครับ",
                size: "xs",
                color: "#A4A4A8",
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
        backgroundColor: "#101010",
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
