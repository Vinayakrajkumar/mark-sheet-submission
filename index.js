require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

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
// MULTER SETUP
// ======================
const upload = multer({ dest: "uploads/" });

// ======================
// ENV VARIABLES
// ======================
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

console.log("🔍 System Booting...");

// ======================
// TEMP OTP STORE
// ======================
const otpStore = {};

// ======================
// HELPER FUNCTIONS
// ======================

// Converts file to Base64 and deletes the temp file safely
const processFile = (fileObject) => {
  if (!fileObject) return "";
  try {
    const file = fs.readFileSync(fileObject.path);
    const base64 = file.toString("base64");
    fs.unlinkSync(fileObject.path); // Delete after reading
    return `data:${fileObject.mimetype};base64,${base64}`;
  } catch (err) {
    console.error("File Processing Error:", err.message);
    return "";
  }
};

// ======================
// ROUTES
// ======================

app.get("/", (req, res) => {
  res.send("Hundred Learning Backend is Live 🚀");
});

// 1️⃣ SUBMIT FORM → SAVE TO GOOGLE SHEET
app.post(
  "/submit-form",
  upload.fields([
    { name: "mark10", maxCount: 1 },
    { name: "idCard", maxCount: 1 },
    { name: "discountMark", maxCount: 1 }
  ]),
  async (req, res) => {
    console.log("📤 Processing form submission...");

    try {
      const { name, phone, parentProfession } = req.body;

      if (!req.files["mark10"] || !req.files["idCard"]) {
        return res.status(400).json({ success: false, message: "Required files missing" });
      }

      const mark10Base64 = processFile(req.files["mark10"][0]);
      const idCardBase64 = processFile(req.files["idCard"][0]);
      const discountMarkBase64 = req.files["discountMark"] ? processFile(req.files["discountMark"][0]) : "";

      if (GOOGLE_SHEET_URL) {
        try {
          const sheetRes = await axios.post(GOOGLE_SHEET_URL, {
            name,
            phone,
            parentProfession,
            idCard: idCardBase64,
            mark10: mark10Base64,
            discountMark: discountMarkBase64
          });
          console.log("📊 Sheet Response:", sheetRes.data);
        } catch (sheetError) {
          console.error("❌ Sheet Error:", sheetError.response?.data || sheetError.message);
        }
      }

      res.json({ success: true });

    } catch (error) {
      console.error("❌ Submit Error:", error.message);
      res.status(500).json({ success: false });
    }
  }
);

// 2️⃣ SEND OTP
app.post("/send-otp", async (req, res) => {
  const { phoneNumber, userName } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: "Phone number required" });
  }

  // CLEAN PHONE NUMBER: Remove symbols and spaces, keep only digits
  const cleanPhone = phoneNumber.replace(/\D/g, ""); 
  
  // Ensure it has the country code (91 for India) but NO '+' symbol
  const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone;

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

  // Store OTP against the clean phone number
  otpStore[cleanPhone] = {
    otp: otpCode,
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  console.log(`📩 Sending OTP ${otpCode} to: ${formattedPhone}`);

  try {
    if (!API_KEY || !API_URL) {
      throw new Error("NeoDove API config missing in .env");
    }

    const response = await axios.post(
      API_URL,
      {
        apiKey: API_KEY,
        campaignName: "OTP5", // Ensure this matches your dashboard exactly
        destination: formattedPhone, // Sending digits only (e.g., 919876543210)
        userName: userName || "Student",
        templateParams: [otpCode],
        source: "Marksheet_Form"
      },
      {
        headers: { 
            "Content-Type": "application/json"
            // Note: If NeoDove fails, try removing the Bearer header below
            // "Authorization": `Bearer ${API_KEY}` 
        }
      }
    );

    console.log("📦 NeoDove Response:", response.data);
    res.json({ success: true });

  } catch (error) {
    console.error("❌ OTP API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3️⃣ VERIFY OTP
app.post("/verify-otp", (req, res) => {
  const { phoneNumber, otpCode } = req.body;
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const record = otpStore[cleanPhone];

  if (record && record.otp === String(otpCode) && Date.now() < record.expiresAt) {
    console.log("✅ OTP Verified for", cleanPhone);
    delete otpStore[cleanPhone]; // Clear OTP after successful use
    return res.json({ success: true });
  }

  console.log("❌ OTP Failed for", cleanPhone);
  res.status(401).json({ success: false, message: "Invalid or expired OTP" });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
