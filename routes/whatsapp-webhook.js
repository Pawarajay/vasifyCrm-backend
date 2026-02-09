// routes/whatsapp-webhook.js
const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../config/database");

const router = express.Router();

// Optional: WhatsApp send function (for admin & user replies)
const WHATSAPP_API_URL = "https://api.aoc-portal.com/v1/whatsapp";
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || "";

const AXIOS_CONFIG = {
  headers: { apikey: WHATSAPP_API_TOKEN },
};

async function sendWhatsappMessage(to, text) {
  if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn("WhatsApp API credentials missing, cannot send message");
    return;
  }

  console.log(`✉️  Sending text to ${to}: "${text}"`);
  const data = {
    recipient_type: "individual",
    from: WHATSAPP_PHONE_NUMBER_ID,
    to,
    type: "text",
    text: { body: text },
  };

  try {
    await axios.post(WHATSAPP_API_URL, data, AXIOS_CONFIG);
    console.log(`✅  Message sent successfully to ${to}.`);
  } catch (error) {
    console.error(
      `❌ Failed to send text message to ${to}:`,
      error.response?.data || error.message
    );
  }
}

// Small helper to sanitize params for MySQL
const sanitizeParams = (...params) =>
  params.map((param) => (param === undefined ? null : param));

/**
 * WhatsApp webhook entrypoint
 * Meta / provider will POST here.
 */
router.post("/webhook", async (req, res) => {
  console.log("📩 Incoming WhatsApp webhook:", JSON.stringify(req.body, null, 2));

  // Always reply 200 OK quickly
  res.sendStatus(200);

  try {
    const body = req.body;

    // 1) Basic validation of provider payload
    if (!body || body.channel !== "whatsapp" || !body.messages || !body.contacts) {
      console.log("Ignoring non-whatsapp or invalid webhook payload");
      return;
    }

    const message = body.messages;
    const from = body.contacts.recipient; // phone number
    const profileName = body.contacts?.profileName || "Unknown Name";

    const userMessage =
      message.type === "text" && message.text?.body
        ? message.text.body.trim()
        : null;

    if (!userMessage) {
      console.log(`Ignoring non-text message from ${from}`);
      return;
    }

    console.log(`--- New WhatsApp message from ${profileName} (${from}) ---`);
    console.log(`Message: "${userMessage}"`);

    // 2) Insert into leads table as a WhatsApp lead
   
 const leadId = uuidv4();

const name = profileName;
const email = `${from}@whatsapp.local`;
const phone = from;
const company = null;
const source = "whatsapp";  
const status = "new";
const priority = "medium";

const estimatedValue = 0;
const notes = userMessage;
const expectedCloseDate = null;
const whatsappNumber = from;
const service = "whatsapp-business-api";
const assignedTo = null;
const createdBy = null;


    await pool.execute(
      `
      INSERT INTO leads (
        id,
        name, email, phone, company, source, status, priority,
        assigned_to, converted_customer_id, estimated_value, notes,
        expected_close_date, whatsapp_number, service,
        created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
      sanitizeParams(
        leadId,
        name,
        email,
        phone,
        company,
        source,
        status,
        priority,
        assignedTo,
        null,
        estimatedValue,
        notes,
        expectedCloseDate,
        whatsappNumber,
        service,
        createdBy
      )
    );

    console.log(`✅ WhatsApp lead inserted into CRM with id: ${leadId}`);

    // 3) Notify admins on WhatsApp (optional, same as your old code)
    if (ADMIN_PHONE_NUMBER) {
      const adminNotification =
        `🔔 New WhatsApp Lead!\n\n` +
        `👤 *From:* ${profileName}\n` +
        `📞 *Number:* ${from}\n` +
        `💬 *Message:* ${userMessage}`;

      const adminNumbers = ADMIN_PHONE_NUMBER.split(",");
      for (const number of adminNumbers) {
        const trimmedNumber = number.trim();
        if (trimmedNumber) {
          await sendWhatsappMessage(trimmedNumber, adminNotification);
        }
      }
    }

    // 4) Send confirmation to user (optional)
    const confirmationMessage =
      "Thank you for your message! We have received it and will get back to you shortly.";
    await sendWhatsappMessage(from, confirmationMessage);
  } catch (error) {
    console.error("❌ Error in WhatsApp webhook handler:", error);
  }
});

module.exports = router;
