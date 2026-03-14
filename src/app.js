import express from "express"
import line from "@line/bot-sdk"
import dotenv from "dotenv"
import OpenAI from "openai"
import imghash from "imghash"
import fs from "fs"
import path from "path"

dotenv.config()

const app = express()

// -------------------------
// LINE CONFIG
// -------------------------

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)

// -------------------------
// OPENAI
// -------------------------

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// -------------------------
// MEMORY STORES
// -------------------------

// กันรูปซ้ำ
const scannedHashes = new Set()

// session user
const userSessions = new Map()

// anti spam
const userRateLimit = new Map()

// -------------------------
// HEALTH CHECK
// -------------------------

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// -------------------------
// RATE LIMIT
// -------------------------

function isRateLimited(userId) {

  const now = Date.now()

  const record = userRateLimit.get(userId)

  if (!record) {
    userRateLimit.set(userId, {
      count: 1,
      time: now
    })
    return false
  }

  if (now - record.time > 10000) {
    userRateLimit.set(userId, {
      count: 1,
      time: now
    })
    return false
  }

  record.count++

  if (record.count > 5) {
    return true
  }

  return false
}

// -------------------------
// WEBHOOK HANDLER
// -------------------------

async function lineWebhookHandler(req, res) {

  try {

    const events = Array.isArray(req.body.events) ? req.body.events : []

    console.log("LINE EVENTS:", events.length)

    await Promise.all(events.map(handleEvent))

    res.json({ success: true })

  } catch (error) {

    console.error("Webhook error:", error)

    res.status(500).end()
  }
}

// -------------------------
// ROUTES
// -------------------------

app.post("/", line.middleware(config), lineWebhookHandler)
app.post("/webhook", line.middleware(config), lineWebhookHandler)
app.post("/webhook/line", line.middleware(config), lineWebhookHandler)

// -------------------------
// MAIN EVENT HANDLER
// -------------------------

async function handleEvent(event) {

  if (event.type !== "message") return null

  const userId = getUserId(event)
  const replyToken = event.replyToken
  const session = userSessions.get(userId)

  if (isRateLimited(userId)) {

    return client.replyMessage(replyToken, {
      type: "text",
      text: "⚠️ กรุณารอสักครู่ก่อนส่งข้อความใหม่"
    })
  }

  // -------------------------
  // TEXT MESSAGE
  // -------------------------

  if (event.message.type === "text") {

    const text = (event.message.text || "").trim()

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
          text: "อาจารย์ Ener ไม่สามารถอ่านพลังได้ในขณะนี้"
        })
      }
    }

    return client.replyMessage(replyToken, {
      type: "text",
      text: `🔮 อาจารย์ Ener

ส่งภาพ
• คริสตัล
• พระเครื่อง
• เครื่องราง

เพื่อให้อาจารย์อ่านพลัง`
    })
  }

  // -------------------------
  // IMAGE MESSAGE
  // -------------------------

  if (event.message.type === "image") {

    try {

      const imageId = event.message.id

      const buffer = await downloadLineImage(imageId)

      const tempPath = path.join(process.cwd(), `tmp-${imageId}.jpg`)

      fs.writeFileSync(tempPath, buffer)

      const hash = await imghash.hash(tempPath)

      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath)
      }

      if (scannedHashes.has(hash)) {

        return client.replyMessage(replyToken, {
          type: "text",
          text: `⚠️ รูปนี้เคยถูกสแกนแล้ว`
        })
      }

      const base64Image = buffer.toString("base64")

      const classify = await classifyObject(base64Image)

      if (classify === "NOT_SUPPORTED") {

        return client.replyMessage(replyToken, {
          type: "text",
          text: `⚠️ Ener Scan รองรับเฉพาะ

• คริสตัล
• พระเครื่อง
• เครื่องราง`
        })
      }

      scannedHashes.add(hash)

      userSessions.set(userId, {
        step: "WAIT_BIRTHDATE",
        base64Image,
        hash,
        objectTypeHint: classify
      })

      return client.replyMessage(replyToken, {
        type: "text",
        text: `🔮 อาจารย์ Ener

รับรูปแล้ว

ต่อไปขอวันเกิดเจ้าของวัตถุ`
      })

    } catch (error) {

      console.error("Image flow error:", error)

      return client.replyMessage(replyToken, {
        type: "text",
        text: "ไม่สามารถอ่านภาพได้"
      })
    }
  }

  return null
}

// -------------------------
// HELPERS
// -------------------------

function getUserId(event) {

  return (
    event?.source?.userId ||
    event?.source?.groupId ||
    event?.source?.roomId ||
    "unknown"
  )
}

function normalizeBirthdate(text) {

  const value = String(text || "").trim()

  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(value)) return value
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return value

  return null
}

// -------------------------
// DOWNLOAD LINE IMAGE
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
// CLASSIFY OBJECT
// -------------------------

async function classifyObject(base64Image) {

  const completion = await openai.chat.completions.create({

    model: "gpt-4o-mini",

    messages: [

      {
        role: "system",
        content: `ตรวจว่าวัตถุเป็น

คริสตัล พระเครื่อง เครื่องราง

ตอบ

SUPPORTED: <ประเภท>

หรือ

NOT_SUPPORTED`
      },

      {
        role: "user",
        content: [

          {
            type: "text",
            text: "วัตถุในภาพคืออะไร"
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

  const raw = String(
    completion?.choices?.[0]?.message?.content || ""
  ).trim()

  if (raw.includes("NOT_SUPPORTED")) return "NOT_SUPPORTED"

  if (raw.includes("SUPPORTED")) {
    return raw.replace("SUPPORTED:", "").trim()
  }

  return "NOT_SUPPORTED"
}

// -------------------------
// DEEP SCAN
// -------------------------

async function analyzeDeepScan({ base64Image, birthdate }) {

  const completion = await openai.chat.completions.create({

    model: "gpt-4o",

    messages: [

      {
        role: "system",
        content: `คุณคืออาจารย์ Ener

อ่านพลังวัตถุจากภาพ
อ่านพลังเจ้าของจากวันเกิด

ตอบภาษาไทย
ไม่เกิน 1200 ตัวอักษร`
      },

      {
        role: "user",
        content: [

          {
            type: "text",
            text: `วันเกิดเจ้าของ ${birthdate}`
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

  return completion?.choices?.[0]?.message?.content || "ไม่สามารถวิเคราะห์ได้"
}

// -------------------------
// SERVER
// -------------------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Ener Scan running on port " + PORT)
})