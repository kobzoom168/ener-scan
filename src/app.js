require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post("/webhook/line", (req, res) => {
  console.log("LINE EVENT RECEIVED:");
  console.log(JSON.stringify(req.body, null, 2));
  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});