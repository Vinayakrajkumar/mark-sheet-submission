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
// MULTER SETUP
// ======================
const upload = multer({ dest: "uploads/" });

// ======================
// ENV VARIABLES
// ======================
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

// Check environment variables on startup
if (!API_KEY || !API_URL || !GOOGLE_SHEET_URL) {
  console.log("⚠️ Missing one or more environment variables!");
} else {
  console.log("✅ Environment variables loaded successfully");
}

// ======================
// TEMP OTP STORE
// ======================
const otpStore = {};

// ======================
// SEND OTP ROUTE
// ======================
app.post("/send-otp", async (req, res) => {

  const { phoneNumber, userName } = req.body;

  console.log("📩 /send-otp HIT:", phoneNumber);

  if (!phoneNumber) {
    console.log("❌ Phone missing");
    return res.status(400).json({ success: false, message: "Phone required" });
  }

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

  otpStore[phoneNumber] = {
    otp: otpCode,
    userName: userName || "Student",
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  try {
    const response = await axios.post(
      API_URL,
      {
        apiKey: API_KEY,
        campaignName: "OTP5",
        destination: phoneNumber,
        userName: userName,
        templateParams: [otpCode]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`
        }
      }
    );

    console.log("✅ OTP sent successfully to:", phoneNumber);
    res.json({ success: true });

  } catch (error) {
    console.error("❌ OTP Error:", error.response?.data || error.message);
    res.status(500).json({ success: false });
  }
});

// ======================
// VERIFY OTP ROUTE
// ======================
app.post("/verify-otp", (req, res) => {

  const { phoneNumber, otpCode } = req.body;

  console.log("🔎 /verify-otp HIT:", phoneNumber);

  const record = otpStore[phoneNumber];

  if (
    record &&
    record.otp === String(otpCode) &&
    Date.now() < record.expiresAt
  ) {
    console.log("✅ OTP verified:", phoneNumber);
    return res.json({ success: true });
  }

  console.log("❌ OTP invalid:", phoneNumber);
  res.json({ success: false, message: "Invalid or expired OTP" });
});

// ======================
// SUBMIT FORM ROUTE
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

    console.log("📤 /submit-form HIT");

    try {
      const { name, phone, parentProfession } = req.body;

      if (!req.files["mark10"] || !req.files["idCard"]) {
        console.log("❌ Required files missing");
        return res.status(400).json({
          success: false,
          message: "Required files missing"
        });
      }

      function toBase64(filePath, mimeType) {
        const file = fs.readFileSync(filePath);
        return `data:${mimeType};base64,` + file.toString("base64");
      }

      const idCardFile = req.files["idCard"][0];
      const mark10File = req.files["mark10"][0];

      const idCardBase64 = toBase64(idCardFile.path, idCardFile.mimetype);
      const mark10Base64 = toBase64(mark10File.path, mark10File.mimetype);

      let mark11Base64 = "";
      let mark12Base64 = "";

      if (req.files["mark11"]) {
        const file = req.files["mark11"][0];
        mark11Base64 = toBase64(file.path, file.mimetype);
      }

      if (req.files["mark12"]) {
        const file = req.files["mark12"][0];
        mark12Base64 = toBase64(file.path, file.mimetype);
      }

      console.log("📊 Sending data to Apps Script...");

      await axios.post(GOOGLE_SHEET_URL, {
        name,
        phone,
        parentProfession,
        idCard: idCardBase64,
        mark10: mark10Base64,
        mark11: mark11Base64,
        mark12: mark12Base64
      });

      console.log("✅ Data saved to Google Sheets");

      res.json({ success: true });

    } catch (error) {
      console.error("❌ Submit Error:", error.response?.data || error.message);
      res.status(500).json({ success: false });
    }
  }
);

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.send("Marksheet Submission Backend Running 🚀");
});

// ======================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
