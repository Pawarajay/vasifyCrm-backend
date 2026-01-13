
const { v4: uuidv4 } = require("uuid");
const express = require("express");
const { body, validationResult, query } = require("express-validator");
const { pool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { calculateDaysUntilExpiry } = require("../utils/helpers");

const router = express.Router();

// Helper: convert undefined to null for MySQL compatibility
const sanitizeParams = (...params) => {
  return params.map((param) => (param === undefined ? null : param));
};

// Helper: normalize Date/ISO string to MySQL DATE (YYYY-MM-DD)
const toSqlDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Helpers
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

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const renewalFieldMap = {
  customerId: "customer_id",
  service: "service",
  amount: "amount",
  expiryDate: "expiry_date",
  status: "status",
  reminderDays: "reminder_days",
  notes: "notes",
};

// Safely add months to date (handles month-end)
const addMonths = (dateStr, months) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d.toISOString().slice(0, 10);
};


const buildRenewalFromCustomer = (customer, body) => {
  const { service, amount, expiryDate, status, reminderDays, notes } = body;

  // 1) Service: from request -> customer.recurring_service -> fallback
  const finalService =
    service ??
    customer.recurring_service ??
    customer.service ??
    "Service";

  // 2) Amount: from request -> customer.recurring_amount -> 0
  const finalAmount =
    amount !== undefined
      ? Number(amount)
      : customer.recurring_amount !== null &&
        customer.recurring_amount !== undefined
      ? Number(customer.recurring_amount)
      : 0;

  // 3) Expiry: from request OR derived from customer.created_at + interval
  let finalExpiry;
  if (expiryDate) {
    // When UI sends a specific expiry date
    finalExpiry = toSqlDate(expiryDate);
  } else {
    // Derive from created_at + interval
    const base =
      customer.created_at ||
      new Date().toISOString().slice(0, 10); // safety fallback

    const interval = customer.recurring_interval || "monthly"; // "monthly" | "yearly"
    const monthsToAdd = interval === "yearly" ? 12 : 1;

    const computed = addMonths(base, monthsToAdd); // returns YYYY-MM-DD string
    finalExpiry = toSqlDate(computed);
  }

  // 4) Status: from request -> customer default -> auto from expiry
  let finalStatus =
    status || customer.default_renewal_status || "active";

  // If still default, auto-adjust based on how far expiry is
  if (!status) {
    const days = calculateDaysUntilExpiry(finalExpiry);
    if (days < 0) {
      finalStatus = "expired";
    } else if (days <= 7) {
      finalStatus = "expiring";
    } else {
      finalStatus = "active";
    }
  }

  // 5) Reminder days: from request -> customer default -> 30
  const finalReminderDays =
    reminderDays !== undefined
      ? Number(reminderDays)
      : customer.default_renewal_reminder_days ?? 30;

  // 6) Notes: from request -> customer default -> null
  const finalNotes =
    notes ??
    customer.default_renewal_notes ??
    null;

  return {
    service: finalService,
    amount: finalAmount,
    expiryDate: finalExpiry,  // YYYY-MM-DD
    status: finalStatus,
    reminderDays: finalReminderDays,
    notes: finalNotes,
  };
};

// helper: ensure user can access a renewal (via customer.assigned_to)
const ensureCanAccessRenewal = async (req, res, renewalId) => {
  if (req.user.role === "admin") return { ok: true };

  const [rows] = await pool.execute(
    `
    SELECT r.id
    FROM renewals r
    INNER JOIN customers c ON r.customer_id = c.id
    WHERE r.id = ? AND c.assigned_to = ?
  `,
    sanitizeParams(renewalId, req.user.userId)
  );

  if (rows.length === 0) {
    return {
      ok: false,
      response: res
        .status(403)
        .json({ error: "You do not have permission to access this renewal" }),
    };
  }

  return { ok: true };
};

// Get all renewals with filtering and pagination
router.get(
  "/",
  authenticateToken,
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("search").optional().isString().withMessage("Search must be a string"),
    query("status")
      .optional()
      .isIn(["active", "expiring", "expired", "renewed"])
      .withMessage("Invalid status"),
    query("customerId").optional().isString().withMessage("Customer ID must be a string"),
    query("expiryDateFrom")
      .optional()
      .isISO8601()
      .withMessage("Expiry date from must be a valid date"),
    query("expiryDateTo")
      .optional()
      .isISO8601()
      .withMessage("Expiry date to must be a valid date"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const pageRaw = Number.parseInt(req.query.page, 10);
      const limitRaw = Number.parseInt(req.query.limit, 10);

      const page = !Number.isNaN(pageRaw) && pageRaw > 0 ? pageRaw : 1;
      const limit =
        !Number.isNaN(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 10;
      const offset = (page - 1) * limit;

      if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
        return res.status(400).json({ error: "Invalid pagination parameters" });
      }

      const { search, status, customerId, expiryDateFrom, expiryDateTo } = req.query;

      let whereClause = "WHERE 1=1";
      const queryParams = [];

      if (req.user.role !== "admin") {
        whereClause += " AND c.assigned_to = ?";
        queryParams.push(req.user.userId);
      }

      if (search) {
        whereClause +=
          " AND (r.service LIKE ? OR c.name LIKE ? OR c.company LIKE ?)";
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
      }

      if (status) {
        whereClause += " AND r.status = ?";
        queryParams.push(status);
      }

      if (customerId) {
        whereClause += " AND r.customer_id = ?";
        queryParams.push(customerId);
      }

      if (expiryDateFrom) {
        whereClause += " AND r.expiry_date >= ?";
        queryParams.push(expiryDateFrom);
      }

      if (expiryDateTo) {
        whereClause += " AND r.expiry_date <= ?";
        queryParams.push(expiryDateTo);
      }

      const renewalsSql = `
        SELECT 
          r.*,
          c.name AS customer_name,
          c.company AS customer_company,
          c.email AS customer_email,
          c.whatsapp_number AS customer_whatsapp
        FROM renewals r
        LEFT JOIN customers c ON r.customer_id = c.id
        ${whereClause}
        ORDER BY r.expiry_date ASC
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}
      `;

      const [renewals] = await pool.execute(
        renewalsSql,
        sanitizeParams(...queryParams)
      );

      const renewalsWithDays = renewals.map((renewal) => ({
        ...renewal,
        daysUntilExpiry: calculateDaysUntilExpiry(renewal.expiry_date),
      }));

      const countSql = `
        SELECT COUNT(*) AS total 
        FROM renewals r
        LEFT JOIN customers c ON r.customer_id = c.id
        ${whereClause}
      `;
      const [countResult] = await pool.execute(
        countSql,
        sanitizeParams(...queryParams)
      );

      const total = countResult[0]?.total || 0;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

      res.json({
        renewals: renewalsWithDays,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error("Renewals fetch error:", error);
      res.status(500).json({ error: "Failed to fetch renewals" });
    }
  }
);

// Get renewal by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const access = await ensureCanAccessRenewal(req, res, id);
    if (!access.ok) return;

    const [renewals] = await pool.execute(
      `
      SELECT 
        r.*,
        c.name AS customer_name,
        c.company AS customer_company,
        c.email AS customer_email,
        c.phone AS customer_phone,
        c.whatsapp_number AS customer_whatsapp
      FROM renewals r
      LEFT JOIN customers c ON r.customer_id = c.id
      WHERE r.id = ?
    `,
      sanitizeParams(id)
    );

    if (renewals.length === 0) {
      return res.status(404).json({ error: "Renewal not found" });
    }

    const renewal = renewals[0];
    renewal.daysUntilExpiry = calculateDaysUntilExpiry(renewal.expiry_date);

    res.json({ renewal });
  } catch (error) {
    console.error("Renewal fetch error:", error);
    res.status(500).json({ error: "Failed to fetch renewal" });
  }
});

// Create new renewal (auto from customer recurring)
router.post(
  "/",
  authenticateToken,
  [
    body("customerId").notEmpty().withMessage("Customer ID is required"),
    // body("service").optional().trim().notEmpty().withMessage("Service is required"),
    body("service").optional().trim(),
    body("amount").optional().isNumeric().withMessage("Amount must be numeric"),
    body("expiryDate")
      .optional()
      .isISO8601()
      .withMessage("Expiry date must be valid"),
    body("status")
      .optional()
      .isIn(["active", "expiring", "expired", "renewed"])
      .withMessage("Invalid status"),
    body("reminderDays")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Reminder days must be a positive integer"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { customerId } = req.body;

      const [customers] = await pool.execute(
        `
        SELECT 
          id,
          assigned_to,
          recurring_enabled,
          recurring_interval,
          recurring_amount,
          recurring_service,
          next_renewal_date,
          default_renewal_status,
          default_renewal_reminder_days,
          default_renewal_notes
        FROM customers
        WHERE id = ?
      `,
        sanitizeParams(customerId)
      );

      if (customers.length === 0) {
        return res.status(400).json({ error: "Customer not found" });
      }

      const customer = customers[0];

      if (
        req.user.role !== "admin" &&
        customer.assigned_to !== req.user.userId
      ) {
        return res.status(403).json({
          error: "You do not have permission to create renewal for this customer",
        });
      }

      const built = buildRenewalFromCustomer(customer, req.body);

      const renewalId = uuidv4();

      await pool.execute(
        `
        INSERT INTO renewals (
          id, customer_id, service, amount, expiry_date, status, reminder_days, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        sanitizeParams(
          renewalId,
          customerId,
          built.service,
          built.amount,
          built.expiryDate, // YYYY-MM-DD
          built.status,
          built.reminderDays,
          built.notes
        )
      );

      // Optionally, update customer's next_renewal_date to the next cycle
      if (customer.recurring_enabled) {
        const nextDate = addMonths(
          built.expiryDate,
          customer.recurring_interval === "yearly" ? 12 : 1
        );
        if (nextDate) {
          await pool.execute(
            "UPDATE customers SET next_renewal_date = ? WHERE id = ?",
            sanitizeParams(nextDate, customerId)
          );
        }
      }

      const [renewals] = await pool.execute(
        `
        SELECT 
          r.*,
          c.name AS customer_name,
          c.company AS customer_company,
          c.email AS customer_email,
          c.whatsapp_number AS customer_whatsapp
        FROM renewals r
        LEFT JOIN customers c ON r.customer_id = c.id
        WHERE r.id = ?
      `,
        sanitizeParams(renewalId)
      );

      const renewal = renewals[0];
      renewal.daysUntilExpiry = calculateDaysUntilExpiry(renewal.expiry_date);

      res.status(201).json({
        message: "Renewal created successfully",
        renewal,
      });
    } catch (error) {
      console.error("Renewal creation error:", error);
      res.status(500).json({ error: "Failed to create renewal" });
    }
  }
);



// Update renewal
router.put(
  "/:id",
  authenticateToken,
  [
    body("customerId").optional().notEmpty().withMessage("Customer ID cannot be empty"),
    body("service").optional().trim(),
    body("amount").optional().isNumeric().withMessage("Amount must be numeric"),
    body("expiryDate").optional().isISO8601().withMessage("Expiry date must be valid"),
    body("status")
      .optional()
      .isIn(["active", "service","expiring", "expired", "renewed"])
      .withMessage("Invalid status"),
    body("reminderDays")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Reminder days must be a positive integer"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { id } = req.params;
      const updateData = { ...req.body };

      const access = await ensureCanAccessRenewal(req, res, id);
      if (!access.ok) return;

      const [existingRenewals] = await pool.execute(
        "SELECT id, customer_id, expiry_date FROM renewals WHERE id = ?",
        sanitizeParams(id)
      );

      if (existingRenewals.length === 0) {
        return res.status(404).json({ error: "Renewal not found" });
      }

      if (updateData.customerId) {
        const [customers] = await pool.execute(
          "SELECT id, assigned_to FROM customers WHERE id = ?",
          sanitizeParams(updateData.customerId)
        );

        if (customers.length === 0) {
          return res.status(400).json({ error: "Customer not found" });
        }

        if (
          req.user.role !== "admin" &&
          customers[0].assigned_to !== req.user.userId
        ) {
          return res.status(403).json({
            error: "You do not have permission to set this customer on renewal",
          });
        }
      }

      // normalize date before building query
      if (updateData.expiryDate) {
        updateData.expiryDate = toSqlDate(updateData.expiryDate);
      }

      const updateFields = [];
      const updateValues = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (value === undefined) return;
        const dbField = renewalFieldMap[key];
        if (!dbField) return;

        updateFields.push(`${dbField} = ?`);
        updateValues.push(value);
      });

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updateValues.push(id);

      await pool.execute(
        `UPDATE renewals SET ${updateFields.join(
          ", "
        )}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        sanitizeParams(...updateValues)
      );

      const [renewals] = await pool.execute(
        `
        SELECT 
          r.*,
          c.name AS customer_name,
          c.company AS customer_company,
          c.email AS customer_email,
          c.whatsapp_number AS customer_whatsapp
        FROM renewals r
        LEFT JOIN customers c ON r.customer_id = c.id
        WHERE r.id = ?
      `,
        sanitizeParams(id)
      );

      const renewal = renewals[0];
      renewal.daysUntilExpiry = calculateDaysUntilExpiry(renewal.expiry_date);

      res.json({
        message: "Renewal updated successfully",
        renewal,
      });
    } catch (error) {
      console.error("Renewal update error:", error);
      res.status(500).json({ error: "Failed to update renewal" });
    }
  }
);

// Delete renewal
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const access = await ensureCanAccessRenewal(req, res, id);
    if (!access.ok) return;

    const [existingRenewals] = await pool.execute(
      "SELECT id FROM renewals WHERE id = ?",
      sanitizeParams(id)
    );

    if (existingRenewals.length === 0) {
      return res.status(404).json({ error: "Renewal not found" });
    }

    await pool.execute(
      "DELETE FROM renewals WHERE id = ?",
      sanitizeParams(id)
    );

    res.json({ message: "Renewal deleted successfully" });
  } catch (error) {
    console.error("Renewal deletion error:", error);
    res.status(500).json({ error: "Failed to delete renewal" });
  }
});

// Get renewal reminders
router.get("/reminders/list", authenticateToken, async (req, res) => {
  try {
    let whereClause = "WHERE rr.status = 'active'";
    const params = [];

    if (req.user.role !== "admin") {
      whereClause += " AND c.assigned_to = ?";
      params.push(req.user.userId);
    }

    const [reminders] = await pool.execute(
      `
      SELECT 
        rr.*,
        c.name AS customer_name,
        c.company AS customer_company,
        c.email AS customer_email,
        c.whatsapp_number AS customer_whatsapp
      FROM renewal_reminders rr
      LEFT JOIN customers c ON rr.customer_id = c.id
      ${whereClause}
      ORDER BY rr.expiry_date ASC
    `,
      sanitizeParams(...params)
    );

    const remindersWithData = reminders.map((reminder) => ({
      ...reminder,
      reminder_days: parseJsonArray(reminder.reminder_days),
      daysUntilExpiry: calculateDaysUntilExpiry(reminder.expiry_date),
    }));

    res.json({ reminders: remindersWithData });
  } catch (error) {
    console.error("Renewal reminders fetch error:", error);
    res.status(500).json({ error: "Failed to fetch renewal reminders" });
  }
});

// Create renewal reminder
router.post(
  "/reminders",
  authenticateToken,
  [
    body("customerId").notEmpty().withMessage("Customer ID is required"),
    body("serviceType")
      .isIn(["whatsapp-panel", "website", "hosting", "domain", "other"])
      .withMessage("Invalid service type"),
    body("serviceName").trim().notEmpty().withMessage("Service name is required"),
    body("expiryDate")
      .isISO8601()
      .withMessage("Expiry date is required and must be valid"),
    body("reminderDays")
      .isArray({ min: 1 })
      .withMessage("Reminder days array is required"),
    body("whatsappTemplate")
      .optional()
      .isString()
      .withMessage("WhatsApp template must be a string"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const {
        customerId,
        serviceType,
        serviceName,
        expiryDate,
        reminderDays,
        whatsappTemplate,
      } = req.body;

      const [customers] = await pool.execute(
        "SELECT id, assigned_to FROM customers WHERE id = ?",
        sanitizeParams(customerId)
      );

      if (customers.length === 0) {
        return res.status(400).json({ error: "Customer not found" });
      }

      if (
        req.user.role !== "admin" &&
        customers[0].assigned_to !== req.user.userId
      ) {
        return res.status(403).json({
          error: "You do not have permission to create reminder for this customer",
        });
      }

      const [result] = await pool.execute(
        `
        INSERT INTO renewal_reminders (
          customer_id, service_type, service_name, expiry_date, reminder_days, whatsapp_template
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        sanitizeParams(
          customerId,
          serviceType,
          serviceName,
          toSqlDate(expiryDate),
          JSON.stringify(reminderDays),
          whatsappTemplate
        )
      );

      const [reminders] = await pool.execute(
        `
        SELECT 
          rr.*,
          c.name AS customer_name,
          c.company AS customer_company,
          c.email AS customer_email,
          c.whatsapp_number AS customer_whatsapp
        FROM renewal_reminders rr
        LEFT JOIN customers c ON rr.customer_id = c.id
        WHERE rr.id = ?
      `,
        sanitizeParams(result.insertId)
      );

      const reminder = reminders[0];
      reminder.reminder_days = parseJsonArray(reminder.reminder_days);
      reminder.daysUntilExpiry = calculateDaysUntilExpiry(reminder.expiry_date);

      res.status(201).json({
        message: "Renewal reminder created successfully",
        reminder,
      });
    } catch (error) {
      console.error("Renewal reminder creation error:", error);
      res.status(500).json({ error: "Failed to create renewal reminder" });
    }
  }
);

// Get renewal statistics
router.get("/stats/overview", authenticateToken, async (req, res) => {
  try {
    let whereClause = "WHERE 1=1";
    const params = [];

    if (req.user.role !== "admin") {
      whereClause +=
        " AND r.customer_id IN (SELECT id FROM customers WHERE assigned_to = ?)";
      params.push(req.user.userId);
    }

    const [stats] = await pool.execute(
      `
      SELECT 
        r.status,
        COUNT(*) AS count,
        SUM(r.amount) AS total_amount
      FROM renewals r
      ${whereClause}
      GROUP BY r.status
    `,
      sanitizeParams(...params)
    );

    const [expiringStats] = await pool.execute(
      `
      SELECT 
        CASE 
          WHEN expiry_date <= CURDATE() THEN 'expired'
          WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) THEN 'expiring_week'
          WHEN expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'expiring_month'
          ELSE 'future'
        END AS expiry_status,
        COUNT(*) AS count,
        SUM(amount) AS total_amount
      FROM renewals r
      ${whereClause}
      AND r.status IN ('active', 'expiring')
      GROUP BY expiry_status
    `,
      sanitizeParams(...params)
    );

    const [monthlyRevenue] = await pool.execute(
      `
      SELECT 
        DATE_FORMAT(expiry_date, '%Y-%m') AS month,
        COUNT(*) AS count,
        SUM(amount) AS total_amount
      FROM renewals r
      ${whereClause}
      AND expiry_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(expiry_date, '%Y-%m')
      ORDER BY month
    `,
      sanitizeParams(...params)
    );

    res.json({
      statusBreakdown: stats,
      expiryBreakdown: expiringStats,
      monthlyRevenue,
    });
  } catch (error) {
    console.error("Renewal stats error:", error);
    res.status(500).json({ error: "Failed to fetch renewal statistics" });
  }
});
// Auto-generate renewals for all customers without a renewal
// router.post(
//   "/auto-generate",
//   authenticateToken,
//   async (req, res) => {
//     try {
//       // Only admins can run this
//       if (req.user.role !== "admin") {
//         return res
//           .status(403)
//           .json({ error: "Only admin can auto-generate renewals" });
//       }

//       // Find customers that do NOT have any renewal yet
//       const [customersWithoutRenewal] = await pool.execute(
//         `
//         SELECT c.*
//         FROM customers c
//         LEFT JOIN renewals r ON r.customer_id = c.id
//         WHERE r.id IS NULL
//       `,
//       );

//       if (customersWithoutRenewal.length === 0) {
//         return res.json({
//           message: "All customers already have renewals",
//           created: 0,
//         });
//       }

//       const createdRenewals = [];

//       for (const customer of customersWithoutRenewal) {
//         // Reuse your existing builder (already updated to use created_at)
//         const built = buildRenewalFromCustomer(customer, {});

//         const renewalId = uuidv4();

//         await pool.execute(
//           `
//           INSERT INTO renewals (
//             id,
//             customer_id,
//             service,
//             amount,
//             expiry_date,
//             status,
//             reminder_days,
//             notes
//           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//         `,
//           sanitizeParams(
//             renewalId,
//             customer.id,
//             built.service,
//             built.amount,
//             built.expiryDate, // YYYY-MM-DD
//             built.status,
//             built.reminderDays,
//             built.notes,
//           ),
//         );

//         createdRenewals.push({
//           renewalId,
//           customerId: customer.id,
//           expiryDate: built.expiryDate,
//           status: built.status,
//         });
//       }

//       return res.json({
//         message: "Auto-generated renewals for customers without one",
//         created: createdRenewals.length,
//         renewals: createdRenewals,
//       });
//     } catch (error) {
//       console.error("Auto-generate renewals error:", error);
//       res
//         .status(500)
//         .json({ error: "Failed to auto-generate renewals" });
//     }
//   },
// );

//without auth


// Auto-generate renewals for all customers without a renewal (TEST ONLY - no auth)
router.post("/auto-generate", async (req, res) => {
  try {
    // Find customers that do NOT have any renewal yet
    const [customersWithoutRenewal] = await pool.execute(
      `
      SELECT c.*
      FROM customers c
      LEFT JOIN renewals r ON r.customer_id = c.id
      WHERE r.id IS NULL
    `,
    );

    if (customersWithoutRenewal.length === 0) {
      return res.json({
        message: "All customers already have renewals",
        created: 0,
      });
    }

    const createdRenewals = [];

    for (const customer of customersWithoutRenewal) {
      const built = buildRenewalFromCustomer(customer, {}); // uses created_at

      const renewalId = uuidv4();

      await pool.execute(
        `
        INSERT INTO renewals (
          id,
          customer_id,
          service,
          amount,
          expiry_date,
          status,
          reminder_days,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        sanitizeParams(
          renewalId,
          customer.id,
          built.service,
          built.amount,
          built.expiryDate,
          built.status,
          built.reminderDays,
          built.notes,
        ),
      );

      createdRenewals.push({
        renewalId,
        customerId: customer.id,
        expiryDate: built.expiryDate,
        status: built.status,
      });
    }

    return res.json({
      message: "Auto-generated renewals for customers without one",
      created: createdRenewals.length,
      renewals: createdRenewals,
    });
  } catch (error) {
    console.error("Auto-generate renewals error:", error);
    res.status(500).json({ error: "Failed to auto-generate renewals" });
  }
});

module.exports = router;
