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

console.log("🔍 System Booting...");
console.log("📄 Google Sheet URL:", GOOGLE_SHEET_URL);

// ======================
// TEMP OTP STORE
// ======================
const otpStore = {};

// ======================
// HEALTH CHECK
// ======================
app.get("/", (req, res) => {
  res.send("Hundred Learning Backend is Live 🚀");
});

// ======================
// 1️⃣ SUBMIT FORM (SAVE TO SHEET FIRST)
// ======================
app.post(
  "/submit-form",
  upload.fields([
    { name: "mark10" },
    { name: "idCard" },
    { name: "discountMark" }
  ]),
  async (req, res) => {

    console.log("📤 Processing form submission...");

    try {
      const { name, phone, parentProfession } = req.body;

      if (!req.files["mark10"] || !req.files["idCard"]) {
        console.log("❌ Required files missing");
        return res.status(400).json({ success: false, message: "Required files missing" });
      }

      const toBase64 = (path, mime) => {
        const file = fs.readFileSync(path);
        const base64 = file.toString("base64");
        fs.unlinkSync(path);
        return `data:${mime};base64,${base64}`;
      };

      const idCardBase64 = toBase64(
        req.files["idCard"][0].path,
        req.files["idCard"][0].mimetype
      );

      const mark10Base64 = toBase64(
        req.files["mark10"][0].path,
        req.files["mark10"][0].mimetype
      );

      const discountMarkBase64 = req.files["discountMark"]
        ? toBase64(
            req.files["discountMark"][0].path,
            req.files["discountMark"][0].mimetype
          )
        : "";

      // ======================
      // SEND TO GOOGLE SHEET
      // ======================
      if (!GOOGLE_SHEET_URL) {
        console.log("❌ GOOGLE_SHEET_URL missing in environment");
      } else {
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

          if (!sheetRes.data.success) {
            console.log("❌ Sheet reported failure:", sheetRes.data.error);
          }

        } catch (sheetError) {
          console.log("❌ Sheet POST Error:",
            sheetError.response?.data || sheetError.message
          );
        }
      }

      res.json({ success: true });

    } catch (error) {
      console.error("❌ Submit Error:", error.message);
      res.status(500).json({ success: false });
    }
  }
);

// ======================
// 2️⃣ SEND OTP (NOW INDEPENDENT)
// ======================
app.post("/send-otp", async (req, res) => {

  const { phoneNumber, userName } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false });
  }

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

  otpStore[phoneNumber] = {
    otp: otpCode,
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  try {

    if (!API_KEY || !API_URL) {
      console.log("❌ API config missing");
      return res.status(500).json({ success: false });
    }

    await axios.post(
      API_URL,
      {
        apiKey: API_KEY,
        campaignName: "OTP5",
        destination: phoneNumber,
        userName: userName || "Student",
        templateParams: [otpCode],
        source: "Marksheet_Form"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`
        }
      }
    );

    console.log("📲 OTP Sent to", phoneNumber);
    res.json({ success: true });

  } catch (error) {
    console.log("❌ OTP Error:",
      error.response?.data || error.message
    );
    res.status(500).json({ success: false });
  }
});

// ======================
// 3️⃣ VERIFY OTP
// ======================
app.post("/verify-otp", (req, res) => {

  const { phoneNumber, otpCode } = req.body;
  const record = otpStore[phoneNumber];

  if (record &&
      record.otp === String(otpCode) &&
      Date.now() < record.expiresAt) {

    console.log("✅ OTP Verified for", phoneNumber);
    return res.json({ success: true });
  }

  console.log("❌ OTP Failed for", phoneNumber);
  res.status(401).json({ success: false });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
