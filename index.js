const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ 
  origin: "*", 
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "admin-password"] 
}));
app.use(express.json());

app.post("/ask", async (req, res) => {
  const { prompt, licenseKey } = req.body;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!licenseKey) {
    return res.status(401).json({ error: "Missing license key." });
  }

  try {
    // Check key in Supabase
    const checkRes = await fetch(`${supabaseUrl}/rest/v1/license_keys?key_string=eq.${licenseKey}&is_active=eq.true`, {
      method: "GET",
      headers: {
        "apikey": supabaseKey,
        "Authorization": "Bearer " + supabaseKey
      }
    });

    const keys = await checkRes.json();

    if (!checkRes.ok || !keys || keys.length === 0) {
      return res.status(401).json({ error: "Invalid or expired license key." });
    }

    // Check if expired
    if (keys[0].expires_at && new Date(keys[0].expires_at) < new Date()) {
      return res.status(401).json({ error: "License key has expired." });
    }

  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({ error: "Database connection failed." });
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
        model: "deepseek-r1-distill-llama-70b",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.6,
      }),
    });

    const data = await groqRes.json();
    console.log("Groq Raw Response:", JSON.stringify(data));

    if (!groqRes.ok) {
      return res.status(groqRes.status).json({ error: data?.error?.message || "Groq error." });
    }

    let answer = data?.choices?.[0]?.message?.content || "";
    
    // Remove <think>...</think> block if it exists
    answer = answer.replace(/<think>[\s\S]*?<\/think>/, "").trim();
    
    // Find the last A, B, C, or D in the remaining text
    const matches = answer.match(/[A-D]/g);
    const letter = matches ? matches[matches.length - 1] : null;

    return res.json({ letter });
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: "Server Error: " + err.message });
  }
});

// --- Admin Endpoints ---

// List all keys
app.get("/admin/list", async (req, res) => {
  const password = (req.headers["admin-password"] || "").trim();
  const target = (process.env.ADMIN_PASSWORD || "").trim();

  if (!target || password !== target) {
    console.log(`Admin login failed. Expected length: ${target.length}, Received length: ${password.length}`);
    return res.status(403).json({ 
      error: "Invalid Admin Password", 
      details: `Length mismatch: Expected ${target.length}, Got ${password.length}`
    });
  }

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/license_keys?select=*&order=created_at.desc`, {
      headers: { 
        "apikey": process.env.SUPABASE_KEY, 
        "Authorization": "Bearer " + process.env.SUPABASE_KEY 
      }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate a new key
app.post("/admin/generate", async (req, res) => {
  const password = (req.headers["admin-password"] || "").trim();
  const target = (process.env.ADMIN_PASSWORD || "").trim();

  if (!target || password !== target) {
    console.log(`Admin generation failed. Expected length: ${target.length}, Received length: ${password.length}`);
    return res.status(403).json({ 
      error: "Invalid Admin Password", 
      details: `Length mismatch: Expected ${target.length}, Got ${password.length}`
    });
  }

  const newKey = 'SAO-' + Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  try {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/license_keys`, {
      method: "POST",
      headers: { 
        "apikey": process.env.SUPABASE_KEY, 
        "Authorization": "Bearer " + process.env.SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify({ key_string: newKey })
    });
    const data = await response.json();
    res.json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Debug endpoint to check if variables are loaded
app.get("/admin/check", (req, res) => {
  res.json({
    version: "1.1.0-debug",
    database_connected: !!process.env.SUPABASE_URL,
    admin_password_set: !!process.env.ADMIN_PASSWORD,
    password_length: process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim().length : 0
  });
});

app.get("/", (req, res) => res.send("SAO Proxy is running."));

app.listen(PORT, () => console.log(`SAO Proxy listening on port ${PORT}`));
