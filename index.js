const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");

const app = express();

// ======================
// MIDDLEWARE
// ======================
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

// ======================
// MULTER SETUP (Handles temporary file storage)
// ======================
const upload = multer({ dest: "uploads/" });

// ======================
// ENV VARIABLES (Ensure these match your Render Dashboard)
// ======================
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

console.log("🔍 System Booting...");
if (!API_KEY) console.log("❌ CRITICAL: API_KEY is missing in Render settings");
if (!API_URL) console.log("❌ CRITICAL: API_URL is missing in Render settings");

// ======================
// TEMP OTP STORE
// ======================
const otpStore = {};

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.send("Hundred Learning: Marksheet Submission Backend is Live 🚀");
});

// ======================
// 1. SEND OTP ROUTE
// ======================
app.post("/send-otp", async (req, res) => {
  const { phoneNumber, userName } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: "Phone number required" });
  }

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  
  // Store OTP with 5-minute expiry
  otpStore[phoneNumber] = {
    otp: otpCode,
    userName: userName || "Student",
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  console.log(`🔐 Generated OTP ${otpCode} for ${phoneNumber}`);

  try {
    // Check if variables exist before calling NeoDove
    if (!API_KEY || !API_URL) {
      console.log("⚠️ API Configuration missing. Check Render Environment Variables.");
      return res.status(500).json({ success: false, message: "Server config error" });
    }

    // NeoDove API V2 Call
    const response = await axios.post(
      API_URL,
      {
        apiKey: API_KEY, // Required in body
        campaignName: "OTP5", // Must match your NeoDove setup
        destination: phoneNumber,
        userName: userName || "Student",
        templateParams: [otpCode],
        source: "Marksheet_Form",
        buttons: [{
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: otpCode }]
        }]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}` // ✅ FIX: Added Bearer to fix 401 Unauthorized
        }
      }
    );

    console.log("✅ NeoDove Success:", response.data);
    res.json({ success: true });

  } catch (error) {
    console.error("❌ NeoDove API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: "Failed to send WhatsApp" });
  }
});

// ======================
// 2. VERIFY OTP ROUTE
// ======================
app.post("/verify-otp", (req, res) => {
  const { phoneNumber, otpCode } = req.body;
  const record = otpStore[phoneNumber];

  if (record && record.otp === String(otpCode) && Date.now() < record.expiresAt) {
    console.log(`✅ ${phoneNumber} verified successfully`);
    return res.json({ success: true });
  }

  console.log(`❌ Verification failed for ${phoneNumber}`);
  res.status(401).json({ success: false, message: "Invalid or expired OTP" });
});

// ======================
// 3. SUBMIT FORM ROUTE
// ======================
app.post(
  "/submit-form",
  upload.fields([
    { name: "mark10" },
    { name: "mark11" },
    { name: "mark12" },
    { name: "idCard" }
  ]),
  async (req, res) => {
    console.log("📤 Processing form submission...");

    try {
      const { name, phone, parentProfession } = req.body;

      // Validate required files
      if (!req.files["mark10"] || !req.files["idCard"]) {
        return res.status(400).json({ success: false, message: "Required files missing" });
      }

      // Function to convert uploaded files to Base64 for Google Sheets
      const toBase64 = (path, mime) => {
        const file = fs.readFileSync(path);
        const base64 = file.toString("base64");
        // Delete file after reading to save server space
        fs.unlinkSync(path); 
        return `data:${mime};base64,${base64}`;
      };

      const idCardBase64 = toBase64(req.files["idCard"][0].path, req.files["idCard"][0].mimetype);
      const mark10Base64 = toBase64(req.files["mark10"][0].path, req.files["mark10"][0].mimetype);

      let mark11Base64 = req.files["mark11"] ? toBase64(req.files["mark11"][0].path, req.files["mark11"][0].mimetype) : "";
      let mark12Base64 = req.files["mark12"] ? toBase64(req.files["mark12"][0].path, req.files["mark12"][0].mimetype) : "";

      // Send Data to Google Sheets Apps Script
      if (GOOGLE_SHEET_URL) {
        await axios.post(GOOGLE_SHEET_URL, {
          name,
          phone,
          parentProfession,
          idCard: idCardBase64,
          mark10: mark10Base64,
          mark11: mark11Base64,
          mark12: mark12Base64
        });
        console.log("📊 Successfully saved to Google Sheets");
      }

      res.json({ success: true });

    } catch (error) {
      console.error("❌ Submit Error:", error.message);
      res.status(500).json({ success: false });
    }
  }
);

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
