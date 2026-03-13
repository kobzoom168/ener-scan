import express from "express"
import axios from "axios"
import dotenv from "dotenv"
import OpenAI from "openai"
import imghash from "imghash"
import fs from "fs"
import path from "path"

dotenv.config()

const app = express()
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

// เก็บ hash ของรูปที่เคย scan
const scannedHashes = new Set()

// ===============================
// HEALTH CHECK
// ===============================

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// ===============================
// LINE WEBHOOK
// ===============================

app.post("/webhook/line", async (req, res) => {

  const events = req.body.events

  for (const event of events) {

    if (event.type !== "message") continue

    const replyToken = event.replyToken

    // ===============================
    // TEXT MESSAGE
    // ===============================

    if (event.message.type === "text") {

      await reply(
        replyToken,
        "🔮 Ener Scan พร้อมแล้ว\n\nส่งรูปพระ / crystal / เครื่องราง มาได้เลย"
      )

    }

    // ===============================
    // IMAGE MESSAGE
    // ===============================

    if (event.message.type === "image") {

      const messageId = event.message.id

      try {

        const imageBuffer = await downloadImage(messageId)

        // save temp file
        const filePath = "./temp.jpg"
        fs.writeFileSync(filePath, imageBuffer)

        // generate hash
        const hash = await imghash.hash(filePath)

        // ตรวจรูปซ้ำ
        if (scannedHashes.has(hash)) {

          await reply(
            replyToken,
            "⚠️ รูปนี้เคยถูกสแกนแล้ว\n\nหากต้องการวิเคราะห์ใหม่ กรุณาถ่ายภาพใหม่ของวัตถุ"
          )

          return
        }

        // บันทึก hash
        scannedHashes.add(hash)

        const base64Image = Buffer.from(imageBuffer).toString("base64")

        const result = await analyzeImage(base64Image)

        await reply(replyToken, result)

      } catch (err) {

        console.error(err)

        await reply(
          replyToken,
          "Ener Scan วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง"
        )

      }

    }

  }

  res.sendStatus(200)

})

// ===============================
// DOWNLOAD IMAGE FROM LINE
// ===============================

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

// ===============================
// OPENAI VISION ANALYSIS
// ===============================

async function analyzeImage(base64Image) {

  const completion = await openai.chat.completions.create({

    model: "gpt-4.1",

    messages: [

      {
        role: "system",
        content: `
You are Ener Scan AI.

Analyze spiritual objects such as:
- Thai amulets
- crystals
- talismans

Respond in Thai.

Format:

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
            text: "Analyze the energy of this object"
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

// ===============================
// REPLY MESSAGE
// ===============================

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

// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Ener Scan Server running")
})