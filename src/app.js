import express from "express"
import line from "@line/bot-sdk"
import dotenv from "dotenv"
import OpenAI from "openai"
import imghash from "imghash"
import fs from "fs"
import path from "path"
import deepScanPrompt from "../prompts/deepScan.prompt.js"

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

const scannedHashes = new Set()
const userSessions = new Map()
const userRateLimit = new Map()

// -------------------------
// HEALTH
// -------------------------

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

app.get("/", (req, res) => {
  res.send("Ener Scan API running")
})

// -------------------------
// RATE LIMIT
// -------------------------

function isRateLimited(userId) {

  const now = Date.now()
  const record = userRateLimit.get(userId)

  if (!record) {
    userRateLimit.set(userId, { count: 1, time: now })
    return false
  }

  if (now - record.time > 10000) {
    userRateLimit.set(userId, { count: 1, time: now })
    return false
  }

  record.count++
  return record.count > 5
}

// -------------------------
// WEBHOOK
// -------------------------

async function lineWebhookHandler(req, res) {

  try {

    const events = Array.isArray(req.body.events)
      ? req.body.events
      : []

    await Promise.all(events.map(handleEvent))

    res.json({ success: true })

  } catch (err) {

    console.error("Webhook error:", err)
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
// MAIN HANDLER
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
15/04
15/04/1995
1995-04-15`
        })
      }

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
    }

    return client.replyMessage(replyToken, {
      type: "text",
      text: `🔮 อาจารย์ Ener

ส่งภาพ
คริสตัล
พระเครื่อง
เครื่องราง

เพื่อให้อาจารย์อ่านพลัง`
    })
  }

  if (event.message.type === "image") {

    const imageId = event.message.id

    const buffer = await downloadLineImage(imageId)

    const tempPath = path.join(process.cwd(), `tmp-${imageId}.jpg`)

    fs.writeFileSync(tempPath, buffer)

    const hash = await imghash.hash(tempPath)

    fs.unlinkSync(tempPath)

    if (scannedHashes.has(hash)) {

      return client.replyMessage(replyToken, {
        type: "text",
        text: "⚠️ รูปนี้เคยถูกสแกนแล้ว"
      })
    }

    const base64Image = buffer.toString("base64")

    const classify = await classifyObject(base64Image)

    if (classify === "NOT_SUPPORTED") {

      return client.replyMessage(replyToken, {
        type: "text",
        text: `⚠️ Ener Scan รองรับเฉพาะ

คริสตัล
พระเครื่อง
เครื่องราง`
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

  const value = String(text).trim()

  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(value)) return value
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) return value

  return null
}

// -------------------------
// DOWNLOAD IMAGE
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

คริสตัล
พระเครื่อง
เครื่องราง

ตอบ

SUPPORTED: <ประเภท>

หรือ

NOT_SUPPORTED`
      },

      {
        role: "user",
        content: [

          { type: "text", text: "วัตถุในภาพคืออะไร" },

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

async function analyzeDeepScan({ base64Image, birthdate, objectTypeHint }) {

  const completion = await openai.chat.completions.create({

    model: "gpt-4o-mini",
    temperature: 0.2,

    messages: [

      {
        role: "system",
        content: deepScanSystemPrompt
      },

      {
        role: "user",
        content: [

          {
            type: "text",
            text: `วันเกิดเจ้าของ ${birthdate}
ประเภทวัตถุ ${objectTypeHint}`
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

  return completion?.choices?.[0]?.message?.content ||
    "อาจารย์ Ener ไม่สามารถอ่านพลังได้"
}

// -------------------------
// SERVER
// -------------------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Ener Scan server running on port", PORT)
})