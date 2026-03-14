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

// -------------------------
// ENV CHECK
// -------------------------

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY missing")
}

if (!process.env.CHANNEL_ACCESS_TOKEN) {
  throw new Error("CHANNEL_ACCESS_TOKEN missing")
}

if (!process.env.CHANNEL_SECRET) {
  throw new Error("CHANNEL_SECRET missing")
}

// -------------------------

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
// MEMORY STORES (MVP)
// -------------------------

const scannedHashes = new Set()
const userSessions = new Map()
const userRateLimit = new Map()

// -------------------------
// HEALTH CHECK
// -------------------------

app.get("/", (req, res) => {
  res.send("Ener Scan API running")
})

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
// TIMEOUT GUARD
// -------------------------

async function withTimeout(promise, ms = 15000) {

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), ms)
  )

  return Promise.race([promise, timeout])
}

// -------------------------
// WEBHOOK
// -------------------------

async function lineWebhookHandler(req, res) {

  try {

    const events = Array.isArray(req.body.events)
      ? req.body.events
      : []

    console.log("Incoming events:", events.length)

    await Promise.all(events.map(handleEvent))

    res.json({ success: true })

  } catch (err) {

    console.error("Webhook error:", err)
    res.status(500).end()
  }
}

// -------------------------
// ROUTE
// -------------------------

app.post("/webhook/line", line.middleware(config), lineWebhookHandler)

// -------------------------
// MAIN HANDLER
// -------------------------

async function handleEvent(event) {

  try {

    if (event.type !== "message") return null

    const userId = getUserId(event)
    const replyToken = event.replyToken
    const session = userSessions.get(userId)

    console.log("User:", userId)
    console.log("Message type:", event.message.type)

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
15/04
15/04/1995
1995-04-15`
          })
        }

        console.log("Birthdate received:", birthdate)

        const result = await withTimeout(
          analyzeDeepScan({
            base64Image: session.base64Image,
            birthdate,
            objectTypeHint: session.objectTypeHint
          }),
          20000
        )

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

    // -------------------------
    // IMAGE MESSAGE
    // -------------------------

    if (event.message.type === "image") {

      const imageId = event.message.id

      console.log("Image received:", imageId)

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

      const classify = await withTimeout(
        classifyObject(base64Image),
        15000
      )

      if (classify === "NOT_SUPPORTED") {

        return client.replyMessage(replyToken, {
          type: "text",
          text: `⚠️ Ener Scan รองรับเฉพาะ

คริสตัล
พระเครื่อง
เครื่องราง`
        })
      }

      const scanId = crypto.randomUUID()

      scannedHashes.add(hash)

      userSessions.set(userId, {

        scanId,
        step: "WAIT_BIRTHDATE",
        base64Image,
        hash,
        objectTypeHint: classify
      })

      console.log("Session created:", scanId)

      return client.replyMessage(replyToken, {
        type: "text",
        text: `🔮 อาจารย์ Ener

รับรูปแล้ว

ต่อไปขอวันเกิดเจ้าของวัตถุ`
      })
    }

  } catch (err) {

    console.error("handleEvent error:", err)
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

    const raw = String(
      completion?.choices?.[0]?.message?.content || ""
    ).trim()

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

// -------------------------
// DEEP SCAN
// -------------------------

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

    return completion?.choices?.[0]?.message?.content ||
      "อาจารย์ Ener ไม่สามารถอ่านพลังได้"

  } catch (err) {

    console.error("DeepScan error:", err)

    return "⚠️ ระบบอ่านพลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
  }
}

// -------------------------
// SERVER
// -------------------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Ener Scan server running on port", PORT)
})