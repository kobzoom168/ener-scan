import express from "express"
import axios from "axios"
import dotenv from "dotenv"
import OpenAI from "openai"

dotenv.config()

const app = express()
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN

// health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

// webhook
app.post("/webhook/line", async (req, res) => {
  const events = req.body.events

  for (const event of events) {

    if (event.type !== "message") continue

    const replyToken = event.replyToken

    // TEXT
    if (event.message.type === "text") {

      await reply(replyToken, "Ener Scan พร้อมแล้ว 👁️ ส่งรูปมาได้เลย")

    }

    // IMAGE
    if (event.message.type === "image") {

      const messageId = event.message.id

      try {

        const imageBuffer = await downloadImage(messageId)

        const result = await analyzeImage()

        await reply(replyToken, result)

      } catch (err) {

        console.error(err)

        await reply(replyToken, "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง")

      }

    }

  }

  res.sendStatus(200)

})

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

async function analyzeImage() {

  const completion = await openai.chat.completions.create({

    model: "gpt-4o-mini",

    messages: [
      {
        role: "system",
        content: "You analyze amulets, talismans, and crystals and describe symbolic energy."
      },
      {
        role: "user",
        content: "Describe the object's energy in Thai."
      }
    ]

  })

  return completion.choices[0].message.content

}

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
        Authorization: `Bearer ${LINE_TOKEN}`
      }
    }
  )

}

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log("Server running")
})