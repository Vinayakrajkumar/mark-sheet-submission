require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

// ========================================================
// 🛠 SELF-HEALING: AUTO-CREATE UPLOADS FOLDER
// ========================================================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  console.log("📁 Creating 'uploads' directory...");
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ======================
// MIDDLEWARE
// ======================
app.use(express.json());
app.use(cors({ origin: "*" }));

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

// Temporary OTP Store
const otpStore = {};

// ======================
// HELPER: PROCESS FILE
// ======================
const processFile = (fileObject) => {
  if (!fileObject) return "";
  try {
    const filePath = path.resolve(fileObject.path);
    const fileData = fs.readFileSync(filePath);
    const base64 = fileData.toString("base64");
    
    // Safety check: only delete if the file actually exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    return `data:${fileObject.mimetype};base64,${base64}`;
  } catch (err) {
    console.error("❌ File processing error:", err.message);
    return "";
  }
};

// ======================
// ROUTES
// ======================

app.get("/", (req, res) => {
  res.send("Hundred Learning Backend is Live 🚀");
});

// 1. SUBMIT FORM
app.post("/submit-form", upload.fields([
  { name: "mark10", maxCount: 1 },
  { name: "idCard", maxCount: 1 },
  { name: "discountMark", maxCount: 1 }
]), async (req, res) => {
  try {
    const { name, phone, parentProfession } = req.body;

    const mark10Base64 = processFile(req.files?.mark10?.[0]);
    const idCardBase64 = processFile(req.files?.idCard?.[0]);
    const discountMarkBase64 = processFile(req.files?.discountMark?.[0]);

    if (GOOGLE_SHEET_URL) {
      await axios.post(GOOGLE_SHEET_URL, {
        name, phone, parentProfession,
        idCard: idCardBase64,
        mark10: mark10Base64,
        discountMark: discountMarkBase64
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("❌ Submit Error:", error.message);
    res.status(500).json({ success: false });
  }
});

// 2. SEND OTP
app.post("/send-otp", async (req, res) => {
  try {
    const { phoneNumber, userName } = req.body;
    if (!phoneNumber) return res.status(400).json({ success: false });

    const cleanPhone = phoneNumber.replace(/\D/g, ""); 
    const formattedPhone = cleanPhone.startsWith("91") ? cleanPhone : "91" + cleanPhone;
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    otpStore[cleanPhone] = { otp: otpCode, expiresAt: Date.now() + 5 * 60 * 1000 };

    console.log(`📩 OTP ${otpCode} -> ${formattedPhone}`);

    const response = await axios.post(API_URL, {
      apiKey: API_KEY,
      campaignName: "OTP5",
      destination: formattedPhone,
      userName: userName || "Student",
      templateParams: [otpCode],
      source: "Marksheet_Form"
    });

    res.json({ success: true });
  } catch (error) {
    console.error("❌ OTP Error:", error.response?.data || error.message);
    res.status(500).json({ success: false });
  }
});

// 3. VERIFY OTP
app.post("/verify-otp", (req, res) => {
  const { phoneNumber, otpCode } = req.body;
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const record = otpStore[cleanPhone];

  if (record && record.otp === String(otpCode) && Date.now() < record.expiresAt) {
    delete otpStore[cleanPhone];
    return res.json({ success: true });
  }
  res.status(401).json({ success: false });
});

// ======================
// SERVER START
// ======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Live on port ${PORT}`);
});
