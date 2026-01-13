const express = require("express")
const { body, validationResult, query } = require("express-validator")
const { pool } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")
const cron = require("node-cron")

const router = express.Router()

// Helpers
const handleValidation = (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    })
  }
  return null
}

const parseJsonArray = (value) => {
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

// Get all WhatsApp campaigns
router.get(
  "/campaigns",
  authenticateToken,
  [
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    query("status").optional().isIn(["draft", "active", "paused", "completed"]).withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const pageRaw = Number.parseInt(req.query.page, 10)
      const limitRaw = Number.parseInt(req.query.limit, 10)

      const page = !Number.isNaN(pageRaw) && pageRaw > 0 ? pageRaw : 1
      const limit = !Number.isNaN(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 10
      const offset = (page - 1) * limit

      const { status } = req.query

      let whereClause = "WHERE 1=1"
      const queryParams = []

      if (status) {
        whereClause += " AND status = ?"
        queryParams.push(status)
      }

      const [campaigns] = await pool.execute(
        `
        SELECT * FROM whatsapp_campaigns 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
        [...queryParams, limit, offset],
      )

      const campaignsWithData = campaigns.map((campaign) => ({
        ...campaign,
        target_audience: parseJsonArray(campaign.target_audience),
      }))

      const [countResult] = await pool.execute(
        `
        SELECT COUNT(*) AS total 
        FROM whatsapp_campaigns 
        ${whereClause}
      `,
        queryParams,
      )

      const total = countResult[0]?.total || 0
      const totalPages = total > 0 ? Math.ceil(total / limit) : 1

      res.json({
        campaigns: campaignsWithData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      })
    } catch (error) {
      console.error("WhatsApp campaigns fetch error:", error)
      res.status(500).json({ error: "Failed to fetch WhatsApp campaigns" })
    }
  },
)

// Create WhatsApp campaign
router.post(
  "/campaigns",
  authenticateToken,
  [
    body("name").trim().notEmpty().withMessage("Campaign name is required"),
    body("template").trim().notEmpty().withMessage("Message template is required"),
    body("targetAudience").isArray().withMessage("Target audience must be an array"),
    body("scheduledAt").optional().isISO8601().withMessage("Scheduled time must be a valid date"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const { name, template, targetAudience, scheduledAt } = req.body

      const [result] = await pool.execute(
        `
        INSERT INTO whatsapp_campaigns (name, template, target_audience, scheduled_at)
        VALUES (?, ?, ?, ?)
      `,
        [name, template, JSON.stringify(targetAudience), scheduledAt],
      )

      const [campaigns] = await pool.execute(
        "SELECT * FROM whatsapp_campaigns WHERE id = ?",
        [result.insertId],
      )

      const campaign = campaigns[0]
      campaign.target_audience = parseJsonArray(campaign.target_audience)

      res.status(201).json({
        message: "WhatsApp campaign created successfully",
        campaign,
      })
    } catch (error) {
      console.error("WhatsApp campaign creation error:", error)
      res.status(500).json({ error: "Failed to create WhatsApp campaign" })
    }
  },
)

// Update campaign status
router.put(
  "/campaigns/:id/status",
  authenticateToken,
  [body("status").isIn(["draft", "active", "paused", "completed"]).withMessage("Invalid status")],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const { id } = req.params
      const { status } = req.body

      await pool.execute(
        "UPDATE whatsapp_campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, id],
      )

      res.json({ message: "Campaign status updated successfully" })
    } catch (error) {
      console.error("Campaign status update error:", error)
      res.status(500).json({ error: "Failed to update campaign status" })
    }
  },
)

// Send WhatsApp message
router.post(
  "/send-message",
  authenticateToken,
  [
    body("phoneNumber").notEmpty().withMessage("Phone number is required"),
    body("message").trim().notEmpty().withMessage("Message is required"),
    body("customerId").optional().isString().withMessage("Customer ID must be a string"),
    body("campaignId").optional().isString().withMessage("Campaign ID must be a string"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const { phoneNumber, message, customerId, campaignId } = req.body

      const [result] = await pool.execute(
        `
        INSERT INTO whatsapp_messages (
          campaign_id, customer_id, phone_number, message, status, sent_at
        )
        VALUES (?, ?, ?, ?, 'sent', NOW())
      `,
        [campaignId, customerId, phoneNumber, message],
      )

      // Placeholder for actual WhatsApp API integration
      console.log(`[WhatsApp] Sending message to ${phoneNumber}: ${message}`)

      setTimeout(async () => {
        try {
          await pool.execute(
            'UPDATE whatsapp_messages SET status = "delivered", delivered_at = NOW() WHERE id = ?',
            [result.insertId],
          )
        } catch (err) {
          console.error("Failed to update WhatsApp message status:", err)
        }
      }, 1000)

      res.json({
        message: "WhatsApp message sent successfully",
        messageId: result.insertId,
      })
    } catch (error) {
      console.error("WhatsApp message send error:", error)
      res.status(500).json({ error: "Failed to send WhatsApp message" })
    }
  },
)

// Get message history
router.get(
  "/messages",
  authenticateToken,
  [
    query("customerId").optional().isString().withMessage("Customer ID must be a string"),
    query("campaignId").optional().isString().withMessage("Campaign ID must be a string"),
    query("status")
      .optional()
      .isIn(["pending", "sent", "delivered", "read", "failed"])
      .withMessage("Invalid status"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const { customerId, campaignId, status } = req.query

      let whereClause = "WHERE 1=1"
      const queryParams = []

      if (customerId) {
        whereClause += " AND wm.customer_id = ?"
        queryParams.push(customerId)
      }

      if (campaignId) {
        whereClause += " AND wm.campaign_id = ?"
        queryParams.push(campaignId)
      }

      if (status) {
        whereClause += " AND wm.status = ?"
        queryParams.push(status)
      }

      const [messages] = await pool.execute(
        `
        SELECT 
          wm.*,
          c.name AS customer_name,
          wc.name AS campaign_name
        FROM whatsapp_messages wm
        LEFT JOIN customers c ON wm.customer_id = c.id
        LEFT JOIN whatsapp_campaigns wc ON wm.campaign_id = wc.id
        ${whereClause}
        ORDER BY wm.created_at DESC
        LIMIT 100
      `,
        queryParams,
      )

      res.json({ messages })
    } catch (error) {
      console.error("WhatsApp messages fetch error:", error)
      res.status(500).json({ error: "Failed to fetch WhatsApp messages" })
    }
  },
)

// Send renewal reminders
router.post("/send-renewal-reminders", authenticateToken, async (req, res) => {
  try {
    const [reminders] = await pool.execute(`
      SELECT 
        rr.*,
        c.name AS customer_name,
        c.whatsapp_number AS customer_whatsapp
      FROM renewal_reminders rr
      LEFT JOIN customers c ON rr.customer_id = c.id
      WHERE rr.status = 'active' 
      AND c.whatsapp_number IS NOT NULL
      AND c.whatsapp_number != ''
    `)

    let sentCount = 0

    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    for (const reminder of reminders) {
      const reminderDays = parseJsonArray(reminder.reminder_days)
      const expiryDate = new Date(reminder.expiry_date)
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24))

      if (!reminderDays.includes(daysUntilExpiry)) continue

      const lastReminderDate = reminder.last_reminder_sent ? new Date(reminder.last_reminder_sent) : null
      const lastReminderStr = lastReminderDate ? lastReminderDate.toISOString().split("T")[0] : null

      if (lastReminderStr === todayStr) continue

      let message =
        reminder.whatsapp_template ||
        "Hi {customerName}, your {serviceName} expires on {expiryDate}. Please renew to continue service."

      message = message
        .replace("{customerName}", reminder.customer_name)
        .replace("{serviceName}", reminder.service_name)
        .replace("{expiryDate}", expiryDate.toLocaleDateString())

      await pool.execute(
        `
        INSERT INTO whatsapp_messages (customer_id, phone_number, message, status, sent_at)
        VALUES (?, ?, ?, 'sent', NOW())
      `,
        [reminder.customer_id, reminder.customer_whatsapp, message],
      )

      await pool.execute(
        "UPDATE renewal_reminders SET last_reminder_sent = CURDATE() WHERE id = ?",
        [reminder.id],
      )

      sentCount++
      console.log(`[Renewal Reminder] Sent to ${reminder.customer_name}: ${message}`)
    }

    res.json({
      message: `Sent ${sentCount} renewal reminders`,
      sentCount,
    })
  } catch (error) {
    console.error("Renewal reminders send error:", error)
    res.status(500).json({ error: "Failed to send renewal reminders" })
  }
})

// Get WhatsApp statistics
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const [campaignStats] = await pool.execute(`
      SELECT 
        status,
        COUNT(*) AS count
      FROM whatsapp_campaigns 
      GROUP BY status
    `)

    const [messageStats] = await pool.execute(`
      SELECT 
        status,
        COUNT(*) AS count
      FROM whatsapp_messages 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY status
    `)

    const [dailyStats] = await pool.execute(`
      SELECT 
        DATE(created_at) AS date,
        COUNT(*) AS count
      FROM whatsapp_messages 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date
    `)

    res.json({
      campaignBreakdown: campaignStats,
      messageBreakdown: messageStats,
      dailyActivity: dailyStats,
    })
  } catch (error) {
    console.error("WhatsApp stats error:", error)
    res.status(500).json({ error: "Failed to fetch WhatsApp statistics" })
  }
})

module.exports = router
