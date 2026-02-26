const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");

const app = express();
app.use(express.json());
app.use(cors());

const upload = multer({ dest: "uploads/" });

// ===== ENV VARIABLES =====
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

// Temporary OTP store
const otpStore = {};

// =============================
// SEND OTP
// =============================
app.post("/send-otp", async (req, res) => {
  const { phoneNumber, userName } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: "Phone required" });
  }

  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

  otpStore[phoneNumber] = {
    otp: otpCode,
    userName: userName || "Student",
    expiresAt: Date.now() + 5 * 60 * 1000
  };

  try {
    await axios.post(
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

    res.json({ success: true });
  } catch (error) {
    console.error("OTP Error:", error.message);
    res.status(500).json({ success: false });
  }
});

// =============================
// VERIFY OTP
// =============================
app.post("/verify-otp", (req, res) => {
  const { phoneNumber, otpCode } = req.body;
  const record = otpStore[phoneNumber];

  if (
    record &&
    record.otp === String(otpCode) &&
    Date.now() < record.expiresAt
  ) {
    return res.json({ success: true });
  }

  res.json({ success: false, message: "Invalid or expired OTP" });
});

// =============================
// SUBMIT FORM
// =============================
app.post(
  "/submit-form",
  upload.fields([
    { name: "mark10" },
    { name: "mark11" },
    { name: "mark12" },
    { name: "idCard" }
  ]),
  async (req, res) => {
    try {
      const { name, phone, parentProfession } = req.body;

      if (!req.files["mark10"] || !req.files["idCard"]) {
        return res.status(400).json({
          success: false,
          message: "Required files missing"
        });
      }

      // Save to Google Sheet
      await axios.post(GOOGLE_SHEET_URL, {
        name,
        phone,
        parentProfession
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Submit Error:", error.message);
      res.status(500).json({ success: false });
    }
  }
);

app.get("/", (req, res) => {
  res.send("Admission Backend Running 🚀");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
