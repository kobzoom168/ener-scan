function createTopAccent(color = "#D4AF37") {
  return {
    type: "box",
    layout: "vertical",
    height: "6px",
    backgroundColor: color,
    cornerRadius: "12px",
    contents: [],
  };
}

function createHeader(title, subtitle) {
  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "xs",
    contents: [
      {
        type: "text",
        text: title,
        weight: "bold",
        size: "xl",
        color: "#F8F8F8",
        wrap: true,
      },
      {
        type: "text",
        text: subtitle,
        size: "sm",
        color: "#A4A4A8",
        wrap: true,
      },
    ],
  };
}

function createCard(title, body, options = {}) {
  const {
    backgroundColor = "#151515",
    borderColor = "#262629",
    bodyColor = "#E3E3E3",
  } = options;

  return {
    type: "box",
    layout: "vertical",
    backgroundColor,
    cornerRadius: "18px",
    borderWidth: "1px",
    borderColor,
    paddingAll: "16px",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: title,
        weight: "bold",
        size: "sm",
        color: "#FFFFFF",
      },
      {
        type: "text",
        text: body,
        size: "sm",
        color: bodyColor,
        wrap: true,
      },
    ],
  };
}

function createExampleCard(label, exampleText) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: "#1D1A14",
    cornerRadius: "16px",
    paddingAll: "14px",
    spacing: "xs",
    contents: [
      {
        type: "text",
        text: label,
        weight: "bold",
        size: "sm",
        color: "#FFFFFF",
      },
      {
        type: "text",
        text: exampleText,
        size: "md",
        weight: "bold",
        color: "#F4E3AE",
        wrap: true,
      },
    ],
  };
}

function createPrimaryFooterButton(label, text, color = "#D4AF37") {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: "#101010",
    paddingTop: "0px",
    paddingBottom: "16px",
    paddingStart: "18px",
    paddingEnd: "18px",
    contents: [
      {
        type: "button",
        style: "primary",
        color,
        action: {
          type: "message",
          label,
          text,
        },
      },
    ],
  };
}

function createUriFooterButton(label, uri, color = "#D4AF37") {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: "#101010",
    paddingTop: "0px",
    paddingBottom: "16px",
    paddingStart: "18px",
    paddingEnd: "18px",
    contents: [
      {
        type: "button",
        style: "primary",
        color,
        action: {
          type: "uri",
          label,
          uri,
        },
      },
    ],
  };
}

function createSecondaryFooterButtons(buttons = []) {
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: "#101010",
    paddingTop: "0px",
    paddingBottom: "16px",
    paddingStart: "18px",
    paddingEnd: "18px",
    spacing: "sm",
    contents: buttons.map((btn, index) => ({
      type: "button",
      style: index === buttons.length - 1 ? "primary" : "secondary",
      color: index === buttons.length - 1 ? btn.color || "#D4AF37" : undefined,
      action: {
        type: "message",
        label: btn.label,
        text: btn.text,
      },
    })),
  };
}

function createBaseBubble({ accentColor, title, subtitle, bodyContents, footer }) {
  return {
    type: "flex",
    altText: title,
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
          createTopAccent(accentColor),
          createHeader(title, subtitle),
          ...bodyContents,
        ],
      },
      footer,
      styles: {
        body: {
          backgroundColor: "#101010",
        },
        footer: {
          backgroundColor: "#101010",
        },
      },
    },
  };
}

export function buildUnsupportedObjectFlex() {
  return createBaseBubble({
    accentColor: "#8E24AA",
    title: "ยังไม่รองรับภาพประเภทนี้",
    subtitle: "Ener Scan อ่านได้เฉพาะวัตถุสายพลังที่อยู่ในขอบเขตของระบบ",
    bodyContents: [
      createCard(
        "ระบบรองรับเฉพาะ",
        "• พระเครื่อง\n• เครื่องราง\n• คริสตัล / หิน\n• วัตถุสายพลังแบบชิ้นเดี่ยว"
      ),
      createCard(
        "คำแนะนำ",
        "กรุณาส่งภาพใหม่ที่เป็นวัตถุ 1 ชิ้น และอยู่ในประเภทที่รองรับ",
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
    ],
    footer: createPrimaryFooterButton("ส่งรูปใหม่", "ขอสแกนชิ้นถัดไป"),
  });
}

export function buildIdleFlex() {
  return createBaseBubble({
    accentColor: "#1565C0",
    title: "เริ่มสแกนวัตถุได้เลย",
    subtitle: "ส่งรูปวัตถุที่ต้องการให้ Ener Scan อ่านพลังได้ทันที",
    bodyContents: [
      createCard(
        "ข้อสำคัญ",
        "กรุณาถ่ายวัตถุ 1 ชิ้นต่อ 1 รูป\nเพื่อให้ระบบอ่านพลังได้ชัดเจนขึ้น",
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
      createCard(
        "ประเภทที่เหมาะ",
        "• พระเครื่อง\n• เครื่องราง\n• คริสตัล / หิน\n• วัตถุสายพลังแบบชิ้นเดี่ยว"
      ),
    ],
    footer: createPrimaryFooterButton("พร้อมเริ่มแล้ว", "ขอสแกนชิ้นถัดไป", "#1565C0"),
  });
}

export function buildDuplicateImageFlex() {
  return createBaseBubble({
    accentColor: "#C62828",
    title: "พบว่ารูปนี้เคยถูกสแกนแล้ว",
    subtitle: "เพื่อให้ผลลัพธ์ใหม่และแม่นขึ้น กรุณาส่งภาพใหม่ของวัตถุ",
    bodyContents: [
      createCard(
        "คำแนะนำ",
        "ลองถ่ายใหม่ให้เห็นวัตถุชัดขึ้น หรือเปลี่ยนมุมภาพก่อนส่งอีกครั้ง",
        {
          backgroundColor: "#1C1515",
          borderColor: "#352626",
        }
      ),
    ],
    footer: createPrimaryFooterButton("ส่งรูปใหม่", "ขอสแกนชิ้นถัดไป", "#C62828"),
  });
}

export function buildWaitingBirthdateFlex() {
  return createBaseBubble({
    accentColor: "#D4AF37",
    title: "ระบบกำลังรอวันเกิดของเจ้าของวัตถุ",
    subtitle: "ส่งวันเกิดเพื่อให้ Ener Scan อ่านความสอดคล้องกับเจ้าของได้",
    bodyContents: [
      createCard(
        "ขั้นตอนถัดไป",
        "กรุณาพิมพ์วันเกิดของเจ้าของวัตถุในรูปแบบ วัน/เดือน/ปี",
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
      createExampleCard("ตัวอย่าง", "14/09/1995"),
    ],
    footer: createSecondaryFooterButtons([
      {
        label: "ส่งวันเกิด",
        text: "14/09/1995",
        color: "#D4AF37",
      },
    ]),
  });
}

export function buildMultipleObjectsFlex() {
  return createBaseBubble({
    accentColor: "#C62828",
    title: "พบว่าวัตถุในภาพมีมากกว่า 1 ชิ้น",
    subtitle: "เพื่อให้ระบบอ่านพลังได้แม่นขึ้น กรุณาส่งเพียง 1 ชิ้นต่อ 1 รูป",
    bodyContents: [
      createCard(
        "คำแนะนำ",
        "หากเป็นของหลายชิ้น กรุณาแยกส่งทีละภาพ แล้วค่อยสแกนทีละชิ้น",
        {
          backgroundColor: "#1C1515",
          borderColor: "#352626",
        }
      ),
    ],
    footer: createPrimaryFooterButton("ส่งรูปใหม่", "ขอสแกนชิ้นถัดไป", "#C62828"),
  });
}

export function buildUnclearImageFlex() {
  return createBaseBubble({
    accentColor: "#8E24AA",
    title: "ภาพยังไม่ชัดเจนพอ",
    subtitle: "ลองถ่ายใหม่ให้เห็นวัตถุชัดขึ้น เพื่อให้ระบบอ่านพลังได้ดีขึ้น",
    bodyContents: [
      createCard(
        "คำแนะนำ",
        "ควรถ่ายให้เห็นวัตถุชัด ๆ แสงพอเหมาะ และมีเพียง 1 ชิ้นต่อ 1 รูป",
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
    ],
    footer: createPrimaryFooterButton("ส่งรูปใหม่", "ขอสแกนชิ้นถัดไป", "#8E24AA"),
  });
}

export function buildRateLimitFlex(retryAfterSec = 0) {
  const waitText =
    retryAfterSec > 0
      ? `กรุณารออีก ${retryAfterSec} วินาทีก่อนสแกนใหม่`
      : "กรุณารอสักครู่ก่อนสแกนใหม่";

  return createBaseBubble({
    accentColor: "#1565C0",
    title: "ระบบมีการใช้งานต่อเนื่อง",
    subtitle: "เพื่อให้การทำงานเสถียร ระบบจะเว้นจังหวะการสแกนไว้ชั่วคราว",
    bodyContents: [
      createCard(
        "สถานะตอนนี้",
        waitText,
        {
          backgroundColor: "#141A22",
          borderColor: "#243344",
        }
      ),
    ],
    footer: createPrimaryFooterButton("ดูประวัติ", "history", "#1565C0"),
  });
}

export function buildCooldownFlex(remainingSec = 0) {
  const waitText =
    remainingSec > 0
      ? `กรุณารออีก ${remainingSec} วินาทีก่อนสแกนใหม่`
      : "กรุณารอสักครู่ก่อนสแกนใหม่";

  return createBaseBubble({
    accentColor: "#2E7D32",
    title: "เว้นจังหวะสักครู่ก่อนสแกนใหม่",
    subtitle: "เพื่อให้ระบบอ่านพลังได้เสถียรมากขึ้น",
    bodyContents: [
      createCard(
        "สถานะตอนนี้",
        waitText,
        {
          backgroundColor: "#142016",
          borderColor: "#26402B",
        }
      ),
    ],
    footer: createPrimaryFooterButton("ดูประวัติ", "history", "#2E7D32"),
  });
}

export function buildPaymentRequiredFlex({ usedScans = 0, freeLimit = 2 } = {}) {
  const used = Number(usedScans || 0);
  const limit = Number(freeLimit || 2);

  return createBaseBubble({
    accentColor: "#D4AF37",
    title: "ต้องชำระเงินก่อนสแกนต่อ",
    subtitle: `คุณใช้สิทธิ์สแกนฟรีครบ ${limit} ครั้งแล้ว`,
    bodyContents: [
      createCard(
        "สถานะตอนนี้",
        `ใช้ไปแล้ว ${used} ครั้ง\nโอนแล้วส่งสลิปในแชทนี้ เดี๋ยวเราตรวจและเปิดสิทธิ์ให้ตามแพ็กเกจ`,
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
      createCard(
        "ขั้นตอนถัดไป",
        "พิมพ์คำว่า payment เพื่อดูวิธีชำระเงิน",
        {
          backgroundColor: "#1D1A14",
          borderColor: "#3A2F1D",
          bodyColor: "#F4E3AE",
        }
      ),
    ],
    footer: createPrimaryFooterButton("ดูวิธีชำระเงิน", "payment", "#D4AF37"),
  });
}

export function buildPaymentPaywallFlex({
  usedScans = 0,
  freeLimit = 2,
  paymentUrl,
  priceTHB = 49,
} = {}) {
  const priceLine = `เพียง ${priceTHB} บาท`;

  const footer = {
    type: "box",
    layout: "vertical",
    backgroundColor: "#101010",
    paddingTop: "0px",
    paddingBottom: "16px",
    paddingStart: "18px",
    paddingEnd: "18px",
    contents: [
      {
        type: "button",
        style: "primary",
        color: "#D4AF37",
        action: {
          type: "uri",
          label: "📱 เปิด QR พร้อมเพย์",
          uri: paymentUrl,
        },
      },
      {
        type: "text",
        text: "โอนตามยอดแล้วส่งสลิป 1 รูปในแชทนี้ เราจะตรวจให้ก่อนเปิดสิทธิ์",
        size: "xs",
        color: "#A4A4A8",
        wrap: true,
        margin: "md",
      },
    ],
  };

  return createBaseBubble({
    accentColor: "#D4AF37",
    title: "🔒 วันนี้คุณใช้สิทธิ์ฟรีครบแล้ว",
    subtitle: "ชำระผ่านพร้อมเพย์ ส่งสลิป รอตรวจสักครู่",
    bodyContents: [
      createCard(
        "ยังมีพลังอีกส่วนที่ยังไม่ถูกเปิดเผย",
        [
          `คุณใช้ครบ ${freeLimit} ครั้งฟรีแล้ว`,
          "",
          "พออนุมัติแล้ว คุณจะดูต่อได้:",
          "• พลังซ่อนเร้นของวัตถุ",
          "• ความเชื่อมโยงกับตัวคุณแบบละเอียด",
          "• คำแนะนำเฉพาะตัว",
          "",
          "✨ แพ็กเกจแนะนำ: สิทธิ์ตามที่แจ้งหลังอนุมัติ (เช่น ใช้ในช่วง 24 ชม.)",
          `💎 ${priceLine}`,
        ].join("\n"),
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
    ],
    footer,
  });
}

/** Image received while slip is already pending_verify — do not run object/scan flow. */
export function buildPendingVerifyFlex() {
  return createBaseBubble({
    accentColor: "#6A4A00",
    title: "⏳ กำลังรอตรวจสลิป",
    subtitle: "ยังส่งรูปสแกนต่อไม่ได้",
    bodyContents: [
      createCard(
        "สถานะตอนนี้",
        [
          "เราได้รับสลิปของคุณแล้ว",
          "ตอนนี้กำลังรอตรวจสอบรายการอยู่",
          "ระหว่างนี้ยังสแกนต่อไม่ได้",
          "พออนุมัติแล้ว เดี๋ยวแจ้งในแชทนี้ทันที",
          "จากนั้นค่อยส่งรูปวัตถุเพื่อสแกนต่อ",
        ].join("\n"),
        {
          backgroundColor: "#1A170F",
          borderColor: "#3D3518",
          bodyColor: "#E8D9A8",
        }
      ),
    ],
    footer: createPrimaryFooterButton("รับทราบ", "เมนูหลัก", "#8D8D8D"),
  });
}

export function buildBirthdateSettingsBubble({ birthdate } = {}) {
  const safeBirthdate = birthdate ? String(birthdate) : "-";

  return {
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
          type: "text",
          text: "ตั้งค่าข้อมูลของคุณ",
          weight: "bold",
          size: "xl",
          color: "#F8F8F8",
          wrap: true,
        },
        {
          type: "text",
          text: `วันเกิดที่บันทึก: ${safeBirthdate}`,
          size: "sm",
          color: "#A4A4A8",
          wrap: true,
        },
        {
          type: "text",
          text: "การเปลี่ยนวันเกิดจะมีผลต่อการตีความผลการสแกนของคุณ",
          size: "sm",
          color: "#E3E3E3",
          wrap: true,
        },
      ],
    },
    footer: createSecondaryFooterButtons([
      {
        label: "เปลี่ยนวันเกิด",
        text: "เปลี่ยนวันเกิด",
        color: "#D4AF37",
      },
      {
        label: "เมนูหลัก",
        text: "เมนูหลัก",
        color: "#1565C0",
      },
    ]),
  };
}

export function buildMainMenuFlex() {
  const bubble1 = createBaseBubble({
    accentColor: "#1565C0",
    title: "เมนูหลัก",
    subtitle: "เลือกหมวดที่ต้องการ (หน้า 1/2)",
    bodyContents: [
      createCard(
        "ตัวเลือก",
        ["• สแกนพลังงาน", "• ประวัติ", "• สถิติ"].join("\n"),
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
    ],
    footer: createSecondaryFooterButtons([
      { label: "สแกนพลังงาน", text: "สแกนพลังงาน", color: "#1565C0" },
      { label: "ประวัติ", text: "ประวัติ", color: "#1565C0" },
      { label: "สถิติ", text: "สถิติ", color: "#1565C0" },
    ]),
  }).contents;

  const bubble2 = createBaseBubble({
    accentColor: "#1565C0",
    title: "เมนูหลัก",
    subtitle: "เลือกหมวดที่ต้องการ (หน้า 2/2)",
    bodyContents: [
      createCard(
        "ตัวเลือก",
        ["• ชำระเงิน", "• ตั้งค่าข้อมูลของคุณ", "• วิธีใช้งาน"].join("\n"),
        {
          backgroundColor: "#171717",
          borderColor: "#242427",
        }
      ),
    ],
    footer: createSecondaryFooterButtons([
      { label: "ชำระเงิน", text: "จ่ายเงิน", color: "#1565C0" },
      { label: "ตั้งค่าข้อมูลของคุณ", text: "เปลี่ยนวันเกิด", color: "#1565C0" },
      { label: "วิธีใช้งาน", text: "วิธีใช้", color: "#1565C0" },
    ]),
  }).contents;

  return {
    type: "flex",
    altText: "เมนูหลัก",
    contents: {
      type: "carousel",
      contents: [bubble1, bubble2],
    },
  };
}
