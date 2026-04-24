const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*" })); // Chrome extensions don't have a fixed origin
app.use(express.json());

app.post("/ask", async (req, res) => {
  const { prompt, licenseKey } = req.body;
  const validKeys = (process.env.LICENSE_KEYS || "").split(",").map(k => k.trim());

  if (!licenseKey || !validKeys.includes(licenseKey)) {
    return res.status(401).json({ error: "Invalid or missing license key. Please upgrade to Premium." });
  }

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return res.status(400).json({ error: "Missing or invalid prompt." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfigured: API key missing." });
  }

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 20,
        temperature: 0,
      }),
    });

    const data = await groqRes.json();
    console.log("Groq Raw Response:", JSON.stringify(data));

    if (!groqRes.ok) {
      return res.status(groqRes.status).json({ error: data?.error?.message || "Groq error." });
    }

    const answer = data?.choices?.[0]?.message?.content?.trim().toUpperCase();
    const letter = answer?.match(/[ABCD]/)?.[0] || null;

    return res.json({ letter });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Server Error: " + err.message });
  }
});

app.get("/", (req, res) => res.send("SAO Proxy is running."));

app.listen(PORT, () => console.log(`SAO Proxy listening on port ${PORT}`));
