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
  const nameLine = teaser
    ? "ชิ้นลับในคลังของคุณ"
    : `${String(top.name || "ชิ้นเด่นในคลัง")}${top.peakLabel ? ` · ${top.peakLabel}` : ""}`;
  const badge = (text, opts2 = {}) => ({
    type: "box",
    layout: "vertical",
    backgroundColor: opts2.bg || BG,
    borderColor: opts2.border || GOLD,
    borderWidth: "1px",
    cornerRadius: "12px",
    paddingAll: "4px",
    paddingStart: "8px",
    paddingEnd: "8px",
    flex: 0,
    contents: [
      { type: "text", text, size: "xxs", color: opts2.color || GOLD, align: "center" },
    ],
  });
  const badges = [badge("อาจารย์เลือกให้วันนี้")];
  if (opts.movedUp) {
    badges.push(badge("ขึ้นจากเมื่อวาน", { bg: "#e8f5ec", border: "#e8f5ec", color: "#2e7d4f" }));
  }

  const infoCol = {
    type: "box",
    layout: "vertical",
    flex: 7,
    spacing: "sm",
    contents: [
      { type: "box", layout: "horizontal", spacing: "sm", contents: badges },
      { type: "text", text: nameLine, weight: "bold", size: "md", color: "#222222", wrap: true },
      {
        type: "box",
        layout: "baseline",
        contents: [
          { type: "text", text: String(top.suit), size: "3xl", weight: "bold", color: GOLD, flex: 0 },
          { type: "text", text: "เหมาะกับวันนี้ %", size: "xs", color: "#888888", margin: "md" },
        ],
      },
      ...(!teaser && opts.reportUrl
        ? [
            {
              type: "text",
              text: "ดูรายละเอียดชิ้นนี้ ›",
              size: "xs",
              color: GOLD,
              weight: "bold",
              action: { type: "uri", label: "ดูรายละเอียด", uri: opts.reportUrl },
            },
          ]
        : []),
    ],
  };
  const showImg = !teaser && top.img && /^https:\/\//i.test(String(top.img));
  const pickBoxContents = showImg
    ? [
        {
          type: "box",
          layout: "vertical",
          flex: 3,
          cornerRadius: "8px",
          contents: [
            {
              type: "image",
              url: String(top.img),
              size: "full",
              aspectRatio: "1:1",
              aspectMode: "cover",
            },
          ],
        },
        infoCol,
      ]
    : [infoCol];

  const subLine = `อิงพลังดาว${String(opts.dayStar || "ประจำวัน")}${
    Number(opts.streak) > 1 ? ` · เปิดต่อเนื่อง ${Number(opts.streak)} วัน` : ""
  }`;

  const bodyContents = [
    { type: "text", text: "ชิ้นไหนหนุนดวงวันนี้", weight: "bold", size: "lg", color: "#222222" },
    { type: "text", text: subLine, size: "xs", color: "#999999", margin: "sm" },
    {
      type: "box",
      layout: "horizontal",
      margin: "md",
      spacing: "md",
      borderColor: "#e3d5b3",
      borderWidth: "1px",
      cornerRadius: "12px",
      paddingAll: "12px",
      contents: pickBoxContents,
    },
    ...(teaser
      ? [
          {
            type: "text",
            text: "เปิดสิทธิ์แล้วดูได้เลยว่าชิ้นไหน จะได้พกถูกชิ้นวันนี้ครับ",
            size: "sm",
            color: "#555555",
            wrap: true,
            margin: "md",
          },
        ]
      : String(top.reason || "").trim()
        ? [
            {
              type: "text",
              text: String(top.reason).trim(),
              size: "sm",
              color: "#555555",
              wrap: true,
              margin: "md",
            },
          ]
        : []),
    {
      type: "text",
      text: "มีชิ้นอื่นที่บ้าน ส่งมาสแกนเทียบดูได้เลยครับ เผื่อมีตัวแรงกว่านี้",
      size: "xs",
      color: "#999999",
      wrap: true,
      margin: "md",
    },
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
      ]
    : opts.reportUrl
      ? [
          {
            type: "button",
            style: "primary",
            color: GOLD,
            height: "sm",
            action: { type: "uri", label: "เปิดดูชิ้นนี้", uri: opts.reportUrl },
          },
        ]
      : [];
  footerContents.push({
    type: "button",
    style: "secondary",
    height: "sm",
    action: { type: "message", label: "สแกนชิ้นใหม่", text: "สแกนพลังงาน" },
  });
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

  return {
    type: "flex",
    altText: String(opts.altText || "").slice(0, 380) || "หนุนดวงเช้านี้",
    contents: bubble,
  };
}

/**
 * การ์ด "ชิ้นเด่นด้าน X ของคุณ" (กบ 19 ก.ค. — ลูกค้าพิมพ์ถาม "ถ้าโชคลาภละ")
 * @param {{ img?: string|null, axisLabelTh: string, axisScore: number,
 *   reportUrl?: string, libraryUrl?: string, mode: "open"|"teaser", altText: string }} p
 */
export function buildAxisTopPieceFlex(p) {
  const teaser = p.mode === "teaser";
  const pieceName = !teaser && p.pieceName ? String(p.pieceName) : "";
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
      text: `⭐ ชิ้นเด่นด้าน${p.axisLabelTh}ของคุณ`,
      weight: "bold",
      size: "md",
      color: GOLD,
      margin: "lg",
      wrap: true,
    },
    ...(pieceName
      ? [
          {
            type: "text",
            text: pieceName,
            weight: "bold",
            size: "sm",
            color: "#333333",
            wrap: true,
            margin: "sm",
          },
        ]
      : []),
    {
      type: "box",
      layout: "baseline",
      margin: "md",
      contents: [
        {
          type: "text",
          text: String(Math.round(p.axisScore)),
          size: "3xl",
          weight: "bold",
          color: GOLD,
          flex: 0,
        },
        { type: "text", text: "คะแนนด้านนี้", size: "xs", color: "#888888", margin: "md" },
      ],
    },
    {
      type: "text",
      text: teaser
        ? "เปิดสิทธิ์แล้วดูได้เลยว่าชิ้นไหน พร้อมรายงานเต็มของชิ้นนี้ครับ"
        : "กดเปิดดูรายงานเต็มของชิ้นนี้ได้เลยครับ",
      size: "xs",
      color: "#666666",
      wrap: true,
      margin: "md",
    },
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
        ...(p.libraryUrl
          ? [
              {
                type: "button",
                style: "secondary",
                height: "sm",
                action: { type: "uri", label: "ดูคลังของคุณ", uri: p.libraryUrl },
              },
            ]
          : []),
      ]
    : [
        ...(p.reportUrl
          ? [
              {
                type: "button",
                style: "primary",
                color: GOLD,
                height: "sm",
                action: { type: "uri", label: "เปิดดูชิ้นนี้", uri: p.reportUrl },
              },
            ]
          : []),
        ...(p.libraryUrl
          ? [
              {
                type: "button",
                style: "link",
                height: "sm",
                action: { type: "uri", label: "ดูคลังทั้งหมด", uri: p.libraryUrl },
              },
            ]
          : []),
      ];
  footerContents.push({
    type: "button",
    style: "secondary",
    height: "sm",
    action: { type: "message", label: "สแกนชิ้นใหม่", text: "สแกนพลังงาน" },
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
  if (!teaser && p.img && /^https:\/\//i.test(String(p.img))) {
    bubble.hero = {
      type: "image",
      url: String(p.img),
      size: "full",
      aspectRatio: "20:13",
      aspectMode: "cover",
    };
  }
  return {
    type: "flex",
    altText: String(p.altText || "").slice(0, 380) || "ชิ้นเด่นตามด้าน",
    contents: bubble,
  };
}
