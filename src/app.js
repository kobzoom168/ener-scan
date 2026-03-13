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

const scannedImages = new Set()

// --------------------
// health check
// --------------------

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// --------------------
// webhook
// --------------------

app.post("/webhook/line", async (req, res) => {

  const events = req.body.events

  for (const event of events) {

    if (event.type !== "message") continue

    const replyToken = event.replyToken

    // TEXT

    if (event.message.type === "text") {

      await reply(replyToken,
`🔮 Ener Oracle พร้อมแล้ว

ส่งภาพ
• คริสตัล
• พระเครื่อง
• เครื่องราง

เพื่ออ่านพลัง`)

    }

    // IMAGE

    if (event.message.type === "image") {

      const messageId = event.message.id

      try {

        const imageBuffer = await downloadImage(messageId)

        const filePath = `./tmp-${messageId}.jpg`

        fs.writeFileSync(filePath, imageBuffer)

        // HASH CHECK

        const hash = await imghash.hash(filePath)

        if (scannedImages.has(hash)) {

          await reply(replyToken,
"⚠️ รูปนี้เคยถูกสแกนแล้ว กรุณาถ่ายภาพใหม่")

          fs.unlinkSync(filePath)
          continue
        }

        scannedImages.add(hash)

        // OBJECT CLASSIFY

        const type = await classifyObject(imageBuffer)

        if (type === "NOT_SUPPORTED") {

          await reply(replyToken,
`⚠️ Ener Oracle

ภาพนี้ไม่ใช่วัตถุที่ Oracle สามารถอ่านพลังได้

Ener Scan รองรับเฉพาะ

• คริสตัล
• พระเครื่อง
• เครื่องราง`)

          fs.unlinkSync(filePath)
          continue
        }

        // ANALYZE ENERGY

        const result = await analyzeEnergy(imageBuffer)

        await reply(replyToken, result)

        fs.unlinkSync(filePath)

      } catch (err) {

        console.error(err)

        await reply(replyToken,
"เกิดข้อผิดพลาด กรุณาลองใหม่")

      }

    }

  }

  res.sendStatus(200)

})


// --------------------
// DOWNLOAD IMAGE
// --------------------

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


// --------------------
// CLASSIFY OBJECT
// --------------------

async function classifyObject(imageBuffer) {

  const base64 = Buffer.from(imageBuffer).toString("base64")

  const completion = await openai.chat.completions.create({

    model: "gpt-4o-mini",

    messages: [
      {
        role: "system",
        content: `
You classify objects in images.

Supported objects:

- crystal
- amulet
- talisman
- sacred object

If the object looks like one of these
return ONLY:

SUPPORTED

If not return ONLY:

NOT_SUPPORTED
`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Classify this object."
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

  return completion.choices[0].message.content.trim()

}


// --------------------
// ANALYZE ENERGY
// --------------------

async function analyzeEnergy(imageBuffer) {

  const base64 = Buffer.from(imageBuffer).toString("base64")

  const completion = await openai.chat.completions.create({

    model: "gpt-4o-mini",

    messages: [
      {
        role: "system",
        content: `
You analyze mystical energy of sacred objects.

Return format:

🔮 Ener Scan Result

Object Type:
Energy Type:
Energy Score (1-10):

Meaning:

Advice:
`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this object's spiritual energy."
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


// --------------------
// LINE REPLY
// --------------------

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


// --------------------
// START SERVER
// --------------------

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {

  console.log("Ener Scan Server running")

})