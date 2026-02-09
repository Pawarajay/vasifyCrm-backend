// routes/public-website-leads.js
const express = require("express");
const { body, validationResult } = require("express-validator");
const { pool } = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

const sanitizeParams = (...params) =>
  params.map((param) => (param === undefined ? null : param));

const handleValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    });
    return true;
  }
  return false;
};

// Simple API key middleware (for backend-to-backend only)
const validateWebsiteApiKey = (req, res, next) => {
  const headerKey =
    req.headers["x-website-api-key"] || req.headers["x-website-apikey"];
  const expectedKey = process.env.WEBSITE_TO_CRM_API_KEY;

  if (!expectedKey) {
    console.error("WEBSITE_TO_CRM_API_KEY is not configured");
    return res.status(500).json({ error: "Internal configuration error" });
  }

  if (!headerKey || headerKey !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};

/**
 * POST /api/public/website-leads
 * Used only by vasifytech website backend to create a lead in CRM.
 * No JWT, only shared API key.
 */
router.post(
  "/website-leads",
  validateWebsiteApiKey,
  [
    body("firstName").trim().notEmpty().withMessage("First name is required"),
    body("lastName").trim().notEmpty().withMessage("Last name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").trim().notEmpty().withMessage("Phone is required"),
    body("message").trim().notEmpty().withMessage("Message is required"),
    body("company").optional().isString().withMessage("Company must be a string"),
    body("service").optional().isString().withMessage("Service must be a string"),
    body("product").optional().isString().withMessage("Product must be a string"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const {
        firstName,
        lastName,
        email,
        phone,
        company,
        service,
        product,
        message,
      } = req.body;

      const fullName = `${firstName} ${lastName}`.trim();

      const safeSource = "website";
      const safeStatus = "new";
      const safePriority = "medium";

      // Try to map website service/product to your service column if useful
      let safeService = null;
      if (service === "WhatsApp Automation") safeService = "whatsapp-business-api";
      else if (service === "CRM Integration") safeService = "website-development";
      else if (service === "Chatbot Development") safeService = "ai-agent";
      else safeService = "other";

      // Basic duplicate check on email OR phone (last 90 days to avoid spam flood)
      const [existing] = await pool.execute(
        `
        SELECT id, created_at
        FROM leads
        WHERE (email = ? OR phone = ?)
          AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
        ORDER BY created_at DESC
        LIMIT 1
      `,
        sanitizeParams(email, phone)
      );

      if (existing.length > 0) {
        return res.status(200).json({
          message: "Lead already exists recently",
          duplicate: true,
          leadId: existing[0].id,
        });
      }

      const leadId = uuidv4();

      // Insert minimal lead data; use notes to store the message + product
      const notesParts = [];
      if (product) notesParts.push(`Product: ${product}`);
      if (message) notesParts.push(`Message: ${message}`);
      const combinedNotes = notesParts.join(" | ");

      await pool.execute(
        `
        INSERT INTO leads (
          id,
          name,
          email,
          phone,
          company,
          source,
          status,
          priority,
          assigned_to,
          converted_customer_id,
          estimated_value,
          notes,
          expected_close_date,
          whatsapp_number,
          service,
          created_by,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
        sanitizeParams(
          leadId,
          fullName,
          email,
          phone,
          company || null,
          safeSource,
          safeStatus,
          safePriority,
          null, // assigned_to
          null, // converted_customer_id
          0, // estimated_value
          combinedNotes || null,
          null, // expected_close_date
          null, // whatsapp_number
          safeService,
          null // created_by (system/website)
        )
      );

      res.status(201).json({
        message: "Lead created successfully from website",
        duplicate: false,
        leadId,
      });
    } catch (error) {
      console.error("Website lead creation error:", error);
      res.status(500).json({ error: "Failed to create lead from website" });
    }
  }
);

module.exports = router;
