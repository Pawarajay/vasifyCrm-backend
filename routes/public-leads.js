// routes/public-leads.js
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

// POST /api/public/website-lead
router.post(
  "/website-lead",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").optional().isString().withMessage("Phone must be a string"),
    body("company").optional().isString().withMessage("Company must be a string"),
    body("service")
      .optional()
      .isIn(["whatsapp-business-api", "website-development", "ai-agent", "other"])
      .withMessage("Invalid service"),
    body("message")
      .optional()
      .isString()
      .withMessage("Message must be a string"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { name, email, phone, company, service, message } = req.body;

      const leadId = uuidv4();
      const safeSource = "website";         // maps to allowed "website" source
      const safeStatus = "new";
      const safePriority = "medium";

      const safeEstimatedValue = 0;
      const safeNotes = message || null;
      const safeExpectedCloseDate = null;
      const safeWhatsappNumber = null;
      const safeService = service || "other";

      // Public leads are unassigned initially; CRM users can assign later
      const assignedTo = null;
      const createdBy = null; // no CRM user, it's from public site

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
          safeSource,
          safeStatus,
          safePriority,
          assignedTo,
          null,
          safeEstimatedValue,
          safeNotes,
          safeExpectedCloseDate,
          safeWhatsappNumber,
          safeService,
          createdBy
        )
      );

      const [leads] = await pool.execute(
        `
        SELECT 
          l.*,
          u.name  AS assigned_user_name,
          cu.name AS created_user_name
        FROM leads l
        LEFT JOIN users u  ON l.assigned_to = u.id
        LEFT JOIN users cu ON l.created_by = cu.id
        WHERE l.id = ?
      `,
        sanitizeParams(leadId)
      );

      return res.status(201).json({
        message: "Lead created successfully from website",
        lead: leads[0],
      });
    } catch (error) {
      console.error("Public website lead creation error:", error);
      return res.status(500).json({ error: "Failed to create website lead" });
    }
  }
);

module.exports = router;
