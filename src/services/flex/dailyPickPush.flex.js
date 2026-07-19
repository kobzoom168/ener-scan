/**
 * การ์ด Flex "หนุนดวงเช้านี้" (กบ 19 ก.ค. 2026) — ธีมขาวคาดทองชุดเดียวกับการ์ดโปร
 * (ไม่เด่นแข่งการ์ดรายงาน) + ปุ่มปิดแจ้งเตือนในการ์ด (message action → "หยุดแจ้งเตือน"
 * เข้าตัวดักใน webhook ที่มีอยู่แล้ว)
 */

const GOLD = "#a5813a";
const BG = "#fffdf6";

function liffPayUrl() {
  const id = String(process.env.LIFF_ID || "").trim();
  return id ? `https://liff.line.me/${id}?view=pay` : "https://lin.ee/6YZeFZ1";
}

/**
 * @param {{ suit: number, peakLabel: string|null, reason: string, img?: string|null }} top
 * @param {{ mode: "open"|"teaser", reportUrl?: string, libraryUrl?: string, altText: string }} opts
 * @returns {object} LINE flex message
 */
export function buildDailyPickPushFlex(top, opts) {
  const teaser = opts.mode === "teaser";
  const headline = teaser
    ? "เปิดสิทธิ์แล้วดูได้เลยว่าชิ้นไหน จะได้พกถูกชิ้นวันนี้ครับ"
    : String(top.reason || "").trim();

  const bodyContents = [
    {
      type: "box",
      layout: "vertical",
      backgroundColor: GOLD,
      height: "4px",
      cornerRadius: "2px",
      contents: [{ type: "filler" }],
    },
    {
      type: "text",
      text: "☀️ หนุนดวงเช้านี้",
      weight: "bold",
      size: "md",
      color: GOLD,
      margin: "lg",
    },
    {
      type: "text",
      text: "วันนี้มีชิ้นในคลังของคุณหนุนดวงถึง",
      size: "sm",
      color: "#555555",
      wrap: true,
      margin: "md",
    },
    {
      type: "box",
      layout: "baseline",
      margin: "sm",
      contents: [
        {
          type: "text",
          text: `${top.suit}%`,
          size: "3xl",
          weight: "bold",
          color: GOLD,
          flex: 0,
        },
        ...(top.peakLabel
          ? [
              {
                type: "text",
                text: `เด่นด้าน${top.peakLabel}`,
                size: "xs",
                color: "#888888",
                margin: "md",
                wrap: true,
              },
            ]
          : []),
      ],
    },
    ...(headline
      ? [
          {
            type: "text",
            text: headline,
            size: "xs",
            color: "#666666",
            wrap: true,
            margin: "md",
          },
        ]
      : []),
  ];

  const footerContents = teaser
    ? [
        {
          type: "button",
          style: "primary",
          color: GOLD,
          height: "sm",
          action: { type: "uri", label: "เปิดสิทธิ์ดูชิ้นนี้", uri: liffPayUrl() },
        },
        ...(opts.libraryUrl
          ? [
              {
                type: "button",
                style: "secondary",
                height: "sm",
                action: { type: "uri", label: "ดูคลังของคุณ", uri: opts.libraryUrl },
              },
            ]
          : []),
      ]
    : [
        ...(opts.reportUrl
          ? [
              {
                type: "button",
                style: "primary",
                color: GOLD,
                height: "sm",
                action: { type: "uri", label: "เปิดดูชิ้นนี้", uri: opts.reportUrl },
              },
            ]
          : []),
      ];
  footerContents.push({
    type: "button",
    style: "link",
    height: "sm",
    action: { type: "message", label: "ปิดแจ้งเตือน", text: "หยุดแจ้งเตือน" },
  });

  /** @type {Record<string, unknown>} */
  const bubble = {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: BG,
      paddingAll: "16px",
      contents: bodyContents,
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      backgroundColor: BG,
      paddingAll: "12px",
      contents: footerContents,
    },
    styles: { body: { backgroundColor: BG }, footer: { backgroundColor: BG } },
  };
  // รูปชิ้นจริงของลูกค้า (เฉพาะโหมดเปิด — teaser ไม่เฉลยชิ้น)
  if (!teaser && top.img && /^https:\/\//i.test(String(top.img))) {
    bubble.hero = {
      type: "image",
      url: String(top.img),
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }

  return {
    type: "flex",
    altText: String(opts.altText || "").slice(0, 380) || "หนุนดวงเช้านี้",
    contents: bubble,
  };
}
