import express from "express"
import line from "@line/bot-sdk"
import dotenv from "dotenv"
import OpenAI from "openai"
import imghash from "imghash"
import fs from "fs"
import path from "path"
import crypto from "crypto"

import { deepScanSystemPrompt } from "../prompts/deepScan.prompt.js"

dotenv.config()

// ===============================
// ENV CHECK
// ===============================

const REQUIRED_ENV = [
  "OPENAI_API_KEY",
  "CHANNEL_ACCESS_TOKEN",
  "CHANNEL_SECRET"
]

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`${key} missing`)
  }
}

// ===============================
// APP
// ===============================

const app = express()

// ===============================
// LINE CONFIG
// ===============================

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
}

const client = new line.Client(config)

// ===============================
// OPENAI
// ===============================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// ===============================
// MEMORY (MVP)
// ===============================

const scannedHashes = new Set()
const userSessions = new Map()
const userRateLimit = new Map()

// ===============================
// ROUTES
// ===============================

app.get("/", (req, res) => {
  res.send("Ener Scan API running")
})

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

app.post("/webhook/line", line.middleware(config), lineWebhookHandler)

// ===============================
// RATE LIMIT
// ===============================

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

// ===============================
// TIMEOUT
// ===============================

async function withTimeout(promise, ms = 15000) {

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), ms)
  )

  return Promise.race([promise, timeout])
}

// ===============================
// WEBHOOK
// ===============================

async function lineWebhookHandler(req, res) {

  try {

    const events = req.body.events || []

    console.log("Incoming events:", events.length)

    await Promise.all(events.map(handleEvent))

    res.json({ ok: true })

  } catch (err) {

    console.error("Webhook error:", err)

    res.status(500).end()
  }
}

// ===============================
// EVENT HANDLER
// ===============================

async function handleEvent(event) {

  try {

    if (event.type !== "message") return null

    const userId = getUserId(event)
    const replyToken = event.replyToken
    const session = userSessions.get(userId)

    console.log("User:", userId)
    console.log("Type:", event.message.type)

    if (isRateLimited(userId)) {

      return reply(replyToken, "⚠️ กรุณารอสักครู่ก่อนส่งข้อความใหม่")
    }

    // =========================
    // TEXT MESSAGE
    // =========================

    if (event.message.type === "text") {

      const text = (event.message.text || "").trim()

      if (session?.step === "WAIT_BIRTHDATE") {

        const birthdate = normalizeBirthdate(text)

        if (!birthdate) {

          return reply(replyToken, `🔮 อาจารย์ Ener

กรุณาส่งวันเกิดเจ้าของวัตถุ

ตัวอย่าง
19/08/1985`)
        }

        console.log("Birthdate:", birthdate)

        const result = await withTimeout(

          analyzeDeepScan({
            base64Image: session.base64Image,
            birthdate,
            objectTypeHint: session.objectTypeHint
          }),

          20000
        )

        userSessions.delete(userId)

        return reply(replyToken, result)
      }

      return reply(replyToken, `🔮 อาจารย์ Ener

ส่งภาพ
คริสตัล
พระเครื่อง
เครื่องราง

เพื่อให้อาจารย์อ่านพลัง`)
    }

    // =========================
    // IMAGE MESSAGE
    // =========================

    if (event.message.type === "image") {

      const imageId = event.message.id

      console.log("Image:", imageId)

      const buffer = await downloadLineImage(imageId)

      const tempPath = path.join(process.cwd(), `tmp-${imageId}.jpg`)

      fs.writeFileSync(tempPath, buffer)

      const hash = await imghash.hash(tempPath)

      fs.unlinkSync(tempPath)

      if (scannedHashes.has(hash)) {

        return reply(replyToken, "⚠️ รูปนี้เคยถูกสแกนแล้ว")
      }

      const base64Image = buffer.toString("base64")

      const classify = await withTimeout(
        classifyObject(base64Image),
        15000
      )

      if (classify === "NOT_SUPPORTED") {

        return reply(replyToken, `⚠️ Ener Scan รองรับเฉพาะ

คริสตัล
พระเครื่อง
เครื่องราง`)
      }

      const scanId = crypto.randomUUID()

      scannedHashes.add(hash)

      userSessions.set(userId, {

        scanId,
        step: "WAIT_BIRTHDATE",
        base64Image,
        objectTypeHint: classify
      })

      console.log("Session:", scanId)

      return reply(replyToken, `🔮 อาจารย์ Ener

รับรูปแล้ว

ต่อไปขอวันเกิดเจ้าของวัตถุ`)
    }

  } catch (err) {

    console.error("handleEvent error:", err)
  }

  return null
}

// ===============================
// REPLY
// ===============================

function reply(replyToken, text) {

  return client.replyMessage(replyToken, {
    type: "text",
    text
  })
}

// ===============================
// USER ID
// ===============================

function getUserId(event) {

  return (
    event?.source?.userId ||
    event?.source?.groupId ||
    event?.source?.roomId ||
    "unknown"
  )
}

// ===============================
// BIRTHDATE NORMALIZE
// ===============================

function normalizeBirthdate(text) {

  const numbers = text.replace(/[^\d]/g, "")

  if (numbers.length !== 8) return null

  const day = numbers.substring(0, 2)
  const month = numbers.substring(2, 4)
  const year = numbers.substring(4)

  return `${year}-${month}-${day}`
}

// ===============================
// DOWNLOAD IMAGE
// ===============================

async function downloadLineImage(messageId) {

  const stream = await client.getMessageContent(messageId)

  const chunks = []

  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

// ===============================
// CLASSIFY OBJECT
// ===============================

async function classifyObject(base64Image) {

  try {

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

    const raw = completion.choices?.[0]?.message?.content || ""

    if (raw.includes("NOT_SUPPORTED")) return "NOT_SUPPORTED"

    if (raw.includes("SUPPORTED")) {

      return raw.replace("SUPPORTED:", "").trim()
    }

    return "NOT_SUPPORTED"

  } catch (err) {

    console.error("classifyObject error:", err)

    return "NOT_SUPPORTED"
  }
}

// ===============================
// DEEP SCAN
// ===============================

async function analyzeDeepScan({ base64Image, birthdate, objectTypeHint }) {

  try {

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

    return completion.choices?.[0]?.message?.content ||
      "อาจารย์ Ener ไม่สามารถอ่านพลังได้"

  } catch (err) {

    console.error("DeepScan error:", err)

    return "⚠️ ระบบอ่านพลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
  }
}

// ===============================
// SERVER
// ===============================

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Ener Scan server running on port", PORT)
})