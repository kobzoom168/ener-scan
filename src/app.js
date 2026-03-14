import express from "express"
import axios from "axios"
import dotenv from "dotenv"
import OpenAI from "openai"
import imghash from "imghash"
import fs from "fs"

dotenv.config()

const app = express()
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

// กันรูปซ้ำใน memory
const scannedImages = new Set()

// กันส่งรูปใหม่ตอนรูปก่อนหน้ายังไม่จบ
const activeUsers = new Set()

// ----------------
// HEALTH CHECK
// ----------------

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// ----------------
// LINE WEBHOOK
// ----------------

app.post("/webhook/line", async (req, res) => {
  const events = Array.isArray(req.body.events) ? req.body.events : []

  // ถ้ามีหลาย image event มาใน webhook เดียวกัน -> บล็อกทั้งชุด
  const imageEvents = events.filter(isImageMessage)
  if (imageEvents.length > 1) {
    await reply(imageEvents[0].replyToken, singleImageOnlyMessage())
    return res.sendStatus(200)
  }

  for (const event of events) {
    if (event?.type !== "message") continue

    const replyToken = event.replyToken

    // TEXT MESSAGE
    if (event.message.type === "text") {
      await reply(
        replyToken,
        `🔮 Ener Oracle พร้อมแล้ว

ส่งภาพ
• คริสตัล
• พระเครื่อง
• เครื่องราง

เพื่ออ่านพลังวัตถุ

หมายเหตุ: ส่งได้ทีละ 1 รูปเท่านั้น`
      )
      continue
    }

    // ไม่ใช่ image ก็ข้าม
    if (!isImageMessage(event)) continue

    // ถ้า LINE ระบุว่าผู้ใช้ส่งหลายรูปพร้อมกัน -> บล็อก
    if (isMultipleImageSet(event)) {
      await reply(replyToken, singleImageOnlyMessage())
      continue
    }

    const userKey = getUserKey(event)

    // ถ้ารูปก่อนหน้ายังประมวลผลอยู่ -> ไม่รับรูปใหม่
    if (activeUsers.has(userKey)) {
      await reply(
        replyToken,
        `⚠️ Ener Oracle

กรุณาส่งภาพได้ทีละรูป

รอให้ Oracle อ่านรูปก่อนหน้าเสร็จก่อน
แล้วค่อยส่งรูปถัดไป`
      )
      continue
    }

    activeUsers.add(userKey)

    let filePath = null

    try {
      const messageId = event.message.id
      const imageBuffer = await downloadImage(messageId)

      filePath = `./tmp-${messageId}.jpg`
      fs.writeFileSync(filePath, imageBuffer)

      // ----------------
      // HASH CHECK
      // ----------------
      const hash = await imghash.hash(filePath)

      if (scannedImages.has(hash)) {
        await reply(
          replyToken,
          `⚠️ รูปนี้เคยถูกสแกนแล้ว

หากต้องการวิเคราะห์ใหม่
กรุณาถ่ายภาพใหม่ของวัตถุ`
        )
        continue
      }

      // ----------------
      // OBJECT CLASSIFY
      // ----------------
      const type = await classifyObject(imageBuffer)

      if (type === "NOT_SUPPORTED") {
        await reply(
          replyToken,
          `⚠️ Ener Oracle

ภาพนี้ไม่ใช่วัตถุที่ Oracle สามารถอ่านพลังได้

Ener Scan รองรับเฉพาะ

• คริสตัล
• พระเครื่อง
• เครื่องราง`
        )
        continue
      }

      // ผ่านทุกด่านแล้วค่อย mark ว่า scan ไปแล้ว
      scannedImages.add(hash)

      // ----------------
      // ANALYZE ENERGY
      // ----------------
      const result = await analyzeEnergy(imageBuffer)
      await reply(replyToken, result)
    } catch (err) {
      console.error("Scan error:", err?.response?.data || err.message || err)

      await reply(
        replyToken,
        `Ener Oracle ไม่สามารถอ่านพลังได้ในขณะนี้

กรุณาลองใหม่อีกครั้ง`
      )
    } finally {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      activeUsers.delete(userKey)
    }
  }

  res.sendStatus(200)
})

// ----------------
// HELPERS
// ----------------

function isImageMessage(event) {
  return event?.type === "message" && event?.message?.type === "image"
}

function isMultipleImageSet(event) {
  const total = Number(event?.message?.imageSet?.total ?? 1)
  return total > 1
}

function getUserKey(event) {
  return (
    event?.source?.userId ||
    event?.source?.groupId ||
    event?.source?.roomId ||
    "unknown"
  )
}

function singleImageOnlyMessage() {
  return `⚠️ Ener Oracle

กรุณาส่งภาพได้ทีละรูป

Ener Scan รองรับการสแกนครั้งละ 1 รูปเท่านั้น`
}

// ----------------
// DOWNLOAD IMAGE
// ----------------

async function downloadImage(messageId) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    headers: {
      Authorization: `Bearer ${LINE_TOKEN}`
    }
  })

  return response.data
}

// ----------------
// OBJECT CLASSIFIER
// ----------------

async function classifyObject(imageBuffer) {
  const base64 = Buffer.from(imageBuffer).toString("base64")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
คุณคือด่านคัดกรองภาพของ Ener Scan

หน้าที่ของคุณคือดูว่าภาพนี้เป็นวัตถุที่ระบบรองรับหรือไม่

รองรับเฉพาะ:
- คริสตัล
- พระเครื่อง
- เครื่องราง
- talisman
- amulet
- sacred object

กติกา:
- ถ้าในภาพมีหลายรูปหลายชิ้น หรือไม่ชัดว่าเป้าหมายคืออะไร ให้ตอบ NOT_SUPPORTED
- ถ้าเป็นห้อง คน สัตว์ อาหาร สายชาร์จ โต๊ะ อุปกรณ์ทั่วไป ให้ตอบ NOT_SUPPORTED
- ถ้าเป็นวัตถุหลักในภาพและดูเหมือนคริสตัล พระเครื่อง หรือเครื่องราง ให้ตอบ SUPPORTED

ห้ามตอบอย่างอื่น
ตอบได้แค่คำเดียว:
SUPPORTED
หรือ
NOT_SUPPORTED
`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "ตรวจว่าภาพนี้เป็นวัตถุที่ Ener Scan รองรับหรือไม่"
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64}`
            }
          }
        ]
      }
    ]
  })

  return normalizeSupportResult(completion.choices[0].message.content)
}

function normalizeSupportResult(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/[`"'*\s]/g, "")
    .toUpperCase()

  if (cleaned.includes("NOT_SUPPORTED")) return "NOT_SUPPORTED"
  if (cleaned.includes("SUPPORTED")) return "SUPPORTED"
  return "NOT_SUPPORTED"
}

// ----------------
// ENERGY ANALYSIS
// ----------------

async function analyzeEnergy(imageBuffer) {
  const base64 = Buffer.from(imageBuffer).toString("base64")

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
คุณคือ Ener Oracle

หน้าที่ของคุณคือวิเคราะห์พลังของ
คริสตัล พระเครื่อง และเครื่องราง

กติกา:
- ตอบเป็นภาษาไทยเท่านั้น
- ห้ามมีภาษาอังกฤษ
- ห้ามใช้คำว่า Object Type, Energy Type, Meaning, Advice
- ใช้โทนลึก สุขุม อ่านง่าย
- ใช้คำว่า มีแนวโน้ม / มักสะท้อน / ช่วยเสริม
- ไม่ฟันธงเกินจริง
- คำตอบกระชับ อ่านใน LINE ง่าย

รูปแบบคำตอบต้องเป็นแบบนี้เท่านั้น:

🔮 Ener Scan Result

✨ ประเภทวัตถุ:
⚡ ประเภทพลังงาน:
📊 คะแนนพลังงาน (1-10):

🧿 ความหมาย:
(อธิบายพลังของวัตถุ)

🪬 คำแนะนำ:
(แนะนำการพกพา การใช้ หรือการดูแล)
`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "วิเคราะห์พลังของวัตถุในภาพนี้"
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64}`
            }
          }
        ]
      }
    ]
  })

  return completion.choices[0].message.content
}

// ----------------
// LINE REPLY
// ----------------

async function reply(token, text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken: token,
      messages: [
        {
          type: "text",
          text: text
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  )
}

// ----------------
// START SERVER
// ----------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Ener Scan Server running")
})