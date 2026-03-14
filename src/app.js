import express from "express"
import line from "@line/bot-sdk"
import dotenv from "dotenv"
import OpenAI from "openai"
import imghash from "imghash"
import fs from "fs"
import path from "path"

dotenv.config()

const app = express()

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// กันรูปซ้ำ
const scannedHashes = new Set()

// session ชั่วคราวต่อ user
const userSessions = new Map()

// -------------------------
// health check
// -------------------------
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// -------------------------
// webhook
// -------------------------
app.post("/webhook/line", line.middleware(config), async (req, res) => {
  try {
    const events = Array.isArray(req.body.events) ? req.body.events : []

    // ถ้ามีหลายรูปมาใน webhook เดียวกัน ให้บล็อกเลย
    const imageEvents = events.filter(
      (event) => event.type === "message" && event.message?.type === "image"
    )

    if (imageEvents.length > 1) {
      await client.replyMessage(imageEvents[0].replyToken, {
        type: "text",
        text: `⚠️ อาจารย์ Ener

กรุณาส่งรูปได้ทีละ 1 รูปเท่านั้น`
      })
      return res.json({ success: true })
    }

    await Promise.all(events.map(handleEvent))
    res.json({ success: true })
  } catch (error) {
    console.error("Webhook error:", error)
    res.status(500).end()
  }
})

// -------------------------
// main handler
// -------------------------
async function handleEvent(event) {
  if (event.type !== "message") return null

  const userId = getUserId(event)
  const replyToken = event.replyToken
  const session = userSessions.get(userId)

  // -------------------------
  // TEXT MESSAGE
  // -------------------------
  if (event.message.type === "text") {
    const text = (event.message.text || "").trim()

    // ถ้ากำลังรอวันเกิด
    if (session?.step === "WAIT_BIRTHDATE") {
      const birthdate = normalizeBirthdate(text)

      if (!birthdate) {
        return client.replyMessage(replyToken, {
          type: "text",
          text: `🔮 อาจารย์ Ener

กรุณาส่งวันเกิดเจ้าของวัตถุ

ตัวอย่าง
• 15/04
• 15/04/1995
• 1995-04-15`
        })
      }

      try {
        const result = await analyzeDeepScan({
          base64Image: session.base64Image,
          birthdate,
          objectTypeHint: session.objectTypeHint
        })

        userSessions.delete(userId)

        return client.replyMessage(replyToken, {
          type: "text",
          text: result
        })
      } catch (error) {
        console.error("Deep scan error:", error)
        userSessions.delete(userId)

        return client.replyMessage(replyToken, {
          type: "text",
          text: `อาจารย์ Ener ไม่สามารถอ่านพลังได้ในขณะนี้

กรุณาลองใหม่อีกครั้ง`
        })
      }
    }

    // default text
    return client.replyMessage(replyToken, {
      type: "text",
      text: `🔮 อาจารย์ Ener

ส่งภาพ
• คริสตัล
• พระเครื่อง
• เครื่องราง

เพื่อให้อาจารย์อ่านพลัง

ระบบรองรับการสแกนทีละ 1 รูป`
    })
  }

  // -------------------------
  // IMAGE MESSAGE
  // -------------------------
  if (event.message.type === "image") {
    // กัน image set หลายรูป
    if (isMultipleImageSet(event)) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: `⚠️ อาจารย์ Ener

กรุณาส่งรูปได้ทีละ 1 รูปเท่านั้น`
      })
    }

    // ถ้ายังมี session ค้างอยู่ ให้เคลียร์ก่อน
    if (session?.step === "WAIT_BIRTHDATE") {
      return client.replyMessage(replyToken, {
        type: "text",
        text: `⚠️ อาจารย์ Ener

กรุณาส่งวันเกิดของเจ้าของวัตถุก่อน
แล้วอาจารย์จะอ่านพลังให้ต่อ`
      })
    }

    try {
      const imageId = event.message.id
      const buffer = await downloadLineImage(imageId)

      const tempFilePath = path.join(process.cwd(), `tmp-${imageId}.jpg`)
      fs.writeFileSync(tempFilePath, buffer)

      // hash กันรูปซ้ำ
      const hash = await imghash.hash(tempFilePath)

      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath)
      }

      if (scannedHashes.has(hash)) {
        return client.replyMessage(replyToken, {
          type: "text",
          text: `⚠️ รูปนี้เคยถูกสแกนแล้ว

หากต้องการวิเคราะห์ใหม่
กรุณาถ่ายภาพใหม่ของวัตถุ`
        })
      }

      const base64Image = buffer.toString("base64")

      // คัดว่ารองรับไหม
      const classifyResult = await classifyObject(base64Image)

      if (classifyResult === "NOT_SUPPORTED") {
        return client.replyMessage(replyToken, {
          type: "text",
          text: `⚠️ อาจารย์ Ener

ภาพนี้ไม่ใช่วัตถุที่อาจารย์ Ener สามารถอ่านพลังได้

Ener Scan รองรับเฉพาะ

• คริสตัล
• พระเครื่อง
• เครื่องราง`
        })
      }

      // mark ว่ารูปนี้ผ่านแล้ว
      scannedHashes.add(hash)

      // เก็บ session แล้วถามวันเกิด
      userSessions.set(userId, {
        step: "WAIT_BIRTHDATE",
        base64Image,
        hash,
        objectTypeHint: classifyResult
      })

      return client.replyMessage(replyToken, {
        type: "text",
        text: `🔮 อาจารย์ Ener

อาจารย์รับรูปแล้ว
ต่อไปขอวันเกิดของเจ้าของวัตถุ
เพื่อวิเคราะห์พลังเจ้าของและความเข้ากันกับวัตถุ

ส่งได้แบบนี้
• 15/04
• 15/04/1995
• 1995-04-15`
      })
    } catch (error) {
      console.error("Image flow error:", error)

      return client.replyMessage(replyToken, {
        type: "text",
        text: `อาจารย์ Ener ไม่สามารถอ่านพลังได้ในขณะนี้

กรุณาลองใหม่อีกครั้ง`
      })
    }
  }

  return null
}

// -------------------------
// helper
// -------------------------
function getUserId(event) {
  return (
    event?.source?.userId ||
    event?.source?.groupId ||
    event?.source?.roomId ||
    "unknown"
  )
}

function isMultipleImageSet(event) {
  const total = Number(event?.message?.imageSet?.total ?? 1)
  return total > 1
}

function normalizeBirthdate(text) {
  const value = String(text || "").trim()

  // รับ 15/04 หรือ 15/04/1995
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(value)) return value

  // รับ 15-04 หรือ 15-04-1995
  if (/^\d{1,2}-\d{1,2}(-\d{2,4})?$/.test(value)) return value

  // รับ 1995-04-15
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return value

  return null
}

// -------------------------
// download image from LINE
// -------------------------
async function downloadLineImage(messageId) {
  const stream = await client.getMessageContent(messageId)

  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

// -------------------------
// classify object
// -------------------------
async function classifyObject(base64Image) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
คุณคือด่านคัดกรองภาพของ Ener Scan

หน้าที่คือดูว่าภาพนี้เป็นวัตถุที่ระบบรองรับหรือไม่

รองรับเฉพาะ
- คริสตัล
- พระเครื่อง
- เครื่องราง
- talisman
- amulet
- sacred object

ถ้าเป็นวัตถุที่รองรับ ให้ตอบสั้นที่สุดว่า
SUPPORTED: <ชื่อหมวด>

ตัวอย่าง
SUPPORTED: คริสตัล
SUPPORTED: พระเครื่อง
SUPPORTED: เครื่องราง

ถ้าไม่ใช่ ให้ตอบว่า
NOT_SUPPORTED

ห้ามตอบอย่างอื่น
`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "ตรวจว่าภาพนี้เป็นวัตถุที่ระบบรองรับหรือไม่"
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ]
  })

  const raw = String(completion.choices[0].message.content || "").trim()

  if (raw.toUpperCase().includes("NOT_SUPPORTED")) {
    return "NOT_SUPPORTED"
  }

  if (raw.toUpperCase().includes("SUPPORTED")) {
    return raw.replace(/^SUPPORTED:\s*/i, "").trim() || "วัตถุมงคล"
  }

  return "NOT_SUPPORTED"
}

// -------------------------
// deep scan
// -------------------------
async function analyzeDeepScan({ base64Image, birthdate, objectTypeHint }) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
คุณคือ "อาจารย์ Ener"

บทบาท:
- อ่านพลังของวัตถุ
- อ่านพลังพื้นฐานของเจ้าของจากวันเกิด
- วิเคราะห์ความเข้ากันระหว่างเจ้าของกับวัตถุ
- ตอบแบบชัดเจนกว่า AI ทั่วไป
- อย่าตอบกลางเกินไป
- ต้องชี้ให้ชัดว่าเด่นด้านไหนเป็นหลัก

หลักการตอบ:
- ตอบเป็นภาษาไทยเท่านั้น
- ใช้น้ำเสียงแบบอาจารย์ผู้รู้ สุขุม ลึก อ่านง่าย
- ใช้คำว่า มีแนวโน้ม / มักสะท้อน / ช่วยเสริม
- ห้ามฟันธงเกินจริง
- ห้ามเดาชนิดหินแบบวิทยาศาสตร์ให้มั่ว
- ถ้าไม่แน่ใจ ให้ใช้คำว่า "ลักษณะพลังใกล้เคียงกับ..."
- ต้องเลือก "พลังหลัก" ให้ชัดเจนเพียง 1 อย่าง
- พลังหลักที่เลือกได้ เช่น
  การเงิน / โชคลาภ / ปกป้อง / เมตตา / ความรัก / สมาธิ / ความนิ่ง / พลังจิต / การเปลี่ยนแปลง

ให้วิเคราะห์จาก:
1. ภาพวัตถุ
2. วันเกิดของเจ้าของ = ${birthdate}
3. หมวดวัตถุเบื้องต้น = ${objectTypeHint}

รูปแบบคำตอบต้องเป็นแบบนี้เท่านั้น

🔮 ผลการอ่านจากอาจารย์ Ener

✨ ประเภทวัตถุ:
⚡ พลังหลัก:
📊 ระดับพลัง (1-10):
🧭 สถานะพลัง:

👤 พลังของเจ้าของ:
อธิบายพลังพื้นฐานของเจ้าของจากวันเกิดแบบสั้นและชัด

🤝 ความเข้ากันกับเจ้าของ:
อธิบายว่าวัตถุนี้เข้ากับเจ้าของในด้านไหน
และช่วยเสริมเรื่องอะไรเป็นหลัก

🧿 คำอ่านพลัง:
อธิบายลึกขึ้นอีกนิด แต่ไม่ยาวเกินไป

🪬 คำแนะนำ:
แนะนำการใช้ การพก หรือช่วงที่เหมาะกับเจ้าของ

เงื่อนไขสำคัญ:
- ทุกส่วนต้องอ่านง่ายใน LINE
- ไม่เกินประมาณ 1200 ตัวอักษร
- ห้ามใช้ภาษาอังกฤษ
`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `ช่วยอ่านพลังของวัตถุนี้ โดยใช้วันเกิดเจ้าของคือ ${birthdate}`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ]
  })

  return completion.choices[0].message.content
}

// -------------------------
// start server
// -------------------------
const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("อาจารย์ Ener running on port " + PORT)
})