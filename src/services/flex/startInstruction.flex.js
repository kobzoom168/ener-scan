export function buildStartInstructionFlex() {
  return {
    type: "flex",
    altText: "รับภาพแล้วครับ ขอวันเกิดของเจ้าของวัตถุเพื่อสร้างรายงาน",
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
                text: "รับภาพเรียบร้อยแล้วครับ",
                weight: "bold",
                size: "xl",
                color: "#F8F8F8",
                wrap: true,
              },
              {
                type: "text",
                text: "กำลังตรวจประเภทวัตถุและความชัดของภาพ จากนั้นจะสรุปผลและสร้างรายงานให้ครับ",
                size: "sm",
                color: "#A4A4A8",
                wrap: true,
              },
            ],
          },

          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#151515",
            cornerRadius: "18px",
            borderWidth: "1px",
            borderColor: "#262629",
            paddingAll: "16px",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: "ประเภทที่รองรับ",
                weight: "bold",
                size: "sm",
                color: "#FFFFFF",
              },
              {
                type: "text",
                text: "• พระเครื่อง\n• เครื่องราง\n• คริสตัล / หิน\n• วัตถุสายพลังที่เป็นชิ้นเดี่ยว",
                size: "sm",
                color: "#E3E3E3",
                wrap: true,
              },
            ],
          },

          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#171717",
            cornerRadius: "16px",
            borderWidth: "1px",
            borderColor: "#242427",
            paddingAll: "14px",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: "ข้อสำคัญก่อนเริ่ม",
                weight: "bold",
                size: "sm",
                color: "#FFFFFF",
              },
              {
                type: "text",
                text: "กรุณาถ่าย 1 ชิ้นต่อ 1 รูป\nหากเป็นของหลายชิ้น กรุณาแยกส่งทีละภาพ",
                size: "sm",
                color: "#E3E3E3",
                wrap: true,
              },
            ],
          },

          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#1D1A14",
            cornerRadius: "16px",
            paddingAll: "14px",
            spacing: "xs",
            contents: [
              {
                type: "text",
                text: "ขอวันเกิดของเจ้าของวัตถุ",
                weight: "bold",
                size: "sm",
                color: "#FFFFFF",
              },
              {
                type: "text",
                text: "เช่น 14/09/1995",
                size: "md",
                weight: "bold",
                color: "#F4E3AE",
                wrap: true,
              },
            ],
          },
        ],
      },
      footer: {
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
              type: "message",
              label: "ส่งวันเกิด",
              text: "14/09/1995",
            },
          },
        ],
      },
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