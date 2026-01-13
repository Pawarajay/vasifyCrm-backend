const express = require("express");
const { body, validationResult, query } = require("express-validator");
const { pool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// Helper: convert undefined to null for MySQL compatibility
const sanitizeParams = (...params) =>
  params.map((param) => (param === undefined ? null : param));

// Validation helper
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

// Map from request body keys to DB column names
const leadFieldMap = {
  name: "name",
  email: "email",
  phone: "phone",
  company: "company",
  source: "source",
  status: "status",
  priority: "priority",
  assignedTo: "assigned_to",
  estimatedValue: "estimated_value",
  notes: "notes",
  expectedCloseDate: "expected_close_date",
  whatsappNumber: "whatsapp_number",
  service: "service",
};

// Helper: check that current user is allowed to access this lead
const ensureCanAccessLead = async (req, res, leadId) => {
  if (req.user.role === "admin") return { ok: true };

  const [rows] = await pool.execute(
    "SELECT id, assigned_to FROM leads WHERE id = ?",
    sanitizeParams(leadId)
  );

  if (rows.length === 0) {
    return {
      ok: false,
      response: res.status(404).json({ error: "Lead not found" }),
    };
  }

  const lead = rows[0];

  if (lead.assigned_to === req.user.id || lead.assigned_to == null) {
    return { ok: true };
  }

  return {
    ok: false,
    response: res
      .status(403)
      .json({ error: "You do not have permission to access this lead" }),
  };
};

// Get all leads with filtering and pagination
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
      .isIn([
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "closed-won",
        "closed-lost",
      ])
      .withMessage("Invalid status"),
    query("priority")
      .optional()
      .isIn(["low", "medium", "high"])
      .withMessage("Invalid priority"),
    query("source")
      .optional()
      .isIn(["website", "referral", "social", "advertisement", "cold-call", "other"])
      .withMessage("Invalid source"),
    query("assignedTo")
      .optional()
      .isString()
      .withMessage("AssignedTo must be a string"),
    query("service")
      .optional()
      .isIn(["whatsapp-business-api", "website-development", "ai-agent", "other"])
      .withMessage("Invalid service"),
    query("createdBy")
      .optional()
      .isString()
      .withMessage("createdBy must be a string"),
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

      const {
        search,
        status,
        priority,
        source,
        assignedTo,
        service,
        createdBy,
      } = req.query;

      let whereClause = "WHERE 1=1";
      const queryParams = [];

      // Per-user data rule
      if (req.user.role !== "admin") {
        whereClause += " AND l.assigned_to = ?";
        queryParams.push(req.user.id);
      }

      if (search) {
        whereClause +=
          " AND (l.name LIKE ? OR l.email LIKE ? OR l.company LIKE ? OR l.phone LIKE ?)";
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (status) {
        whereClause += " AND l.status = ?";
        queryParams.push(status);
      }

      if (priority) {
        whereClause += " AND l.priority = ?";
        queryParams.push(priority);
      }

      if (source) {
        whereClause += " AND l.source = ?";
        queryParams.push(source);
      }

      if (assignedTo && req.user.role === "admin") {
        whereClause += " AND l.assigned_to = ?";
        queryParams.push(assignedTo);
      }

      if (service) {
        whereClause += " AND l.service = ?";
        queryParams.push(service);
      }

      if (createdBy && req.user.role === "admin") {
        whereClause += " AND l.created_by = ?";
        queryParams.push(createdBy);
      }

      const leadsSql = `
        SELECT 
          l.*,
          u.name  AS assigned_user_name,
          cu.name AS created_user_name
        FROM leads l
        LEFT JOIN users u  ON l.assigned_to = u.id
        LEFT JOIN users cu ON l.created_by = cu.id
        ${whereClause}
        ORDER BY l.created_at DESC
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}
      `;

      const [leads] = await pool.execute(
        leadsSql,
        sanitizeParams(...queryParams)
      );

      const countSql = `
        SELECT COUNT(*) AS total 
        FROM leads l 
        ${whereClause}
      `;
      const [countResult] = await pool.execute(
        countSql,
        sanitizeParams(...queryParams)
      );

      const total = countResult[0]?.total || 0;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

      res.json({
        leads,
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
      console.error("Leads fetch error:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  }
);

// Lead stats for dashboard cards
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const params = [];
    let whereClause = "WHERE 1=1";

    if (req.user.role !== "admin") {
      whereClause += " AND assigned_to = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.execute(
      `
      SELECT
        COUNT(*) AS totalLeads,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newLeads,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) AS qualifiedLeads,
        SUM(CASE WHEN status = 'closed-won' THEN 1 ELSE 0 END) AS closedWonLeads,
        SUM(
          CASE WHEN status = 'closed-won'
               THEN COALESCE(estimated_value, 0)
               ELSE 0
          END
        ) AS closedWonValue
      FROM leads
      ${whereClause}
    `,
      sanitizeParams(...params)
    );

    const stats = rows[0] || {
      totalLeads: 0,
      newLeads: 0,
      qualifiedLeads: 0,
      closedWonLeads: 0,
      closedWonValue: 0,
    };

    res.json({ stats });
  } catch (error) {
    console.error("Lead stats error:", error);
    res.status(500).json({ error: "Failed to fetch lead stats" });
  }
});

// Get lead by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const access = await ensureCanAccessLead(req, res, id);
    if (!access.ok) return;

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
      sanitizeParams(id)
    );

    if (leads.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const lead = leads[0];

    const [tasks] = await pool.execute(
      'SELECT id, title, type, status, due_date FROM tasks WHERE related_type = "lead" AND related_id = ?',
      sanitizeParams(id)
    );

    res.json({
      lead,
      related: {
        tasks,
      },
    });
  } catch (error) {
    console.error("Lead fetch error:", error);
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// Create new lead
router.post(
  "/",
  authenticateToken,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").optional().isString().withMessage("Phone must be a string"),
    body("company").optional().isString().withMessage("Company must be a string"),
    body("source")
      .optional()
      .isIn(["website", "referral", "social", "advertisement", "cold-call", "other"])
      .withMessage("Invalid source"),
    body("status")
      .optional()
      .isIn([
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "closed-won",
        "closed-lost",
      ])
      .withMessage("Invalid status"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high"])
      .withMessage("Invalid priority"),
    body("assignedTo")
      .optional()
      .isString()
      .withMessage("AssignedTo must be a string"),
    body("estimatedValue")
      .optional()
      .isNumeric()
      .withMessage("Estimated value must be numeric"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
    body("expectedCloseDate")
      .optional()
      .isISO8601()
      .withMessage("Expected close date must be a valid date"),
    body("whatsappNumber")
      .optional()
      .isString()
      .withMessage("WhatsApp number must be a string"),
    body("service")
      .optional()
      .isIn(["whatsapp-business-api", "website-development", "ai-agent", "other"])
      .withMessage("Invalid service"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      // req.user is set by authenticateToken; id is the user identifier
      if (!req.user || !req.user.id) {
        return res
          .status(401)
          .json({ error: "Unauthenticated: user not found in token" });
      }

      const {
        name,
        email,
        phone,
        company,
        source,
        status,
        priority,
        assignedTo: rawAssignedTo,
        estimatedValue,
        notes,
        expectedCloseDate,
        whatsappNumber,
        service,
      } = req.body;

      const safeSource = source ?? "website";
      const safeStatus = status ?? "new";
      const safePriority = priority ?? "medium";
      const safeEstimatedValue =
        estimatedValue === undefined || estimatedValue === null
          ? 0
          : Number(estimatedValue);

      const safeNotes = notes ?? null;

      let safeExpectedCloseDate = null;
      if (expectedCloseDate) {
        const d = new Date(expectedCloseDate);
        if (!Number.isNaN(d.getTime())) {
          safeExpectedCloseDate = d.toISOString().slice(0, 10);
        }
      }

      const safeWhatsappNumber = whatsappNumber ?? null;
      const safeService = service ?? null;

      let assignedTo = rawAssignedTo ?? null;

      // Non-admin: always assign to current user
      if (req.user.role !== "admin") {
        assignedTo = req.user.id;
      } else if (assignedTo === "" || assignedTo === "0" || assignedTo === 0) {
        assignedTo = null;
      }

      if (assignedTo != null) {
        const [userRows] = await pool.execute(
          "SELECT id FROM users WHERE id = ?",
          sanitizeParams(assignedTo)
        );
        if (userRows.length === 0) {
          return res.status(400).json({ error: "Invalid assigned user" });
        }
      }

      // creator of the lead (user id from token)
      const createdBy = req.user.id;

      const leadId = uuidv4();

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

      res.status(201).json({
        message: "Lead created successfully",
        lead: leads[0],
      });
    } catch (error) {
      console.error("Lead creation error:", error);
      res.status(500).json({ error: "Failed to create lead" });
    }
  }
);

// Update lead
router.put(
  "/:id",
  authenticateToken,
  [
    body("name").optional().trim().notEmpty().withMessage("Name cannot be empty"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("phone").optional().isString().withMessage("Phone must be a string"),
    body("company").optional().isString().withMessage("Company must be a string"),
    body("source")
      .optional()
      .isIn(["website", "referral", "social", "advertisement", "cold-call", "other"])
      .withMessage("Invalid source"),
    body("status")
      .optional()
      .isIn([
        "new",
        "contacted",
        "qualified",
        "proposal",
        "negotiation",
        "closed-won",
        "closed-lost",
      ])
      .withMessage("Invalid status"),
    body("priority")
      .optional()
      .isIn(["low", "medium", "high"])
      .withMessage("Invalid priority"),
    body("assignedTo")
      .optional()
      .isString()
      .withMessage("AssignedTo must be a string"),
    body("estimatedValue")
      .optional()
      .isNumeric()
      .withMessage("Estimated value must be numeric"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
    body("expectedCloseDate")
      .optional()
      .isISO8601()
      .withMessage("Expected close date must be a valid date"),
    body("whatsappNumber")
      .optional()
      .isString()
      .withMessage("WhatsApp number must be a string"),
    body("service")
      .optional()
      .isIn(["whatsapp-business-api", "website-development", "ai-agent", "other"])
      .withMessage("Invalid service"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { id } = req.params;
      const updateData = { ...req.body };

      const access = await ensureCanAccessLead(req, res, id);
      if (!access.ok) return;

      if (Object.prototype.hasOwnProperty.call(updateData, "assignedTo")) {
        if (req.user.role !== "admin") {
          delete updateData.assignedTo;
        } else {
          let assignedTo = updateData.assignedTo ?? null;
          if (assignedTo === "" || assignedTo === "0" || assignedTo === 0) {
            assignedTo = null;
          }
          if (assignedTo != null) {
            const [userRows] = await pool.execute(
              "SELECT id FROM users WHERE id = ?",
              sanitizeParams(assignedTo)
            );
            if (userRows.length === 0) {
              return res.status(400).json({ error: "Invalid assigned user" });
            }
          }
          updateData.assignedTo = assignedTo;
        }
      }

      const [existingLeads] = await pool.execute(
        "SELECT id FROM leads WHERE id = ?",
        sanitizeParams(id)
      );

      if (existingLeads.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const updateFields = [];
      const updateValues = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (value === undefined) return;
        const dbField = leadFieldMap[key];
        if (!dbField) return;

        updateFields.push(`${dbField} = ?`);
        updateValues.push(value);
      });

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updateValues.push(id);

      await pool.execute(
        `UPDATE leads SET ${updateFields.join(
          ", "
        )}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        sanitizeParams(...updateValues)
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
        sanitizeParams(id)
      );

      res.json({
        message: "Lead updated successfully",
        lead: leads[0],
      });
    } catch (error) {
      console.error("Lead update error:", error);
      res.status(500).json({ error: "Failed to update lead" });
    }
  }
);
router.post(
  "/:id/convert",
  authenticateToken,
  [body("customerData").optional().isObject().withMessage("Customer data must be an object")],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { id } = req.params;
      const { customerData = {} } = req.body;

      const access = await ensureCanAccessLead(req, res, id);
      if (!access.ok) return;

      const [leads] = await pool.execute(
        "SELECT * FROM leads WHERE id = ?",
        sanitizeParams(id)
      );

      if (leads.length === 0) {
        return res.status(404).json({ error: "Lead not found" });
      }

      const lead = leads[0];

      if (lead.status !== "closed-won") {
        return res.status(400).json({
          error: "Only leads with status 'closed-won' can be converted to customers",
        });
      }

      const connection = await pool.getConnection();
      await connection.beginTransaction();

      try {
        let assignedTo = customerData.assignedTo ?? lead.assigned_to ?? null;
        if (assignedTo === "" || assignedTo === "0" || assignedTo === 0) {
          assignedTo = null;
        }
        if (assignedTo != null) {
          const [userRows] = await connection.execute(
            "SELECT id FROM users WHERE id = ?",
            sanitizeParams(assignedTo)
          );
          if (userRows.length === 0) {
            assignedTo = null;
          }
        }

        const customerId = uuidv4();

        // normalize tags to an array before stringify
        let tagsArray = [];
        if (Array.isArray(customerData.tags)) {
          tagsArray = customerData.tags;
        } else if (
          typeof customerData.tags === "string" &&
          customerData.tags.trim() !== ""
        ) {
          tagsArray = [customerData.tags.trim()];
        }

        // derive service and address from lead or customerData
        const service =
          customerData.service || lead.service || null;
        const address =
          customerData.address || lead.address || null;

        // Insert only into known columns, let the rest use defaults/null
        await connection.execute(
          `
          INSERT INTO customers (
            id,
            name,
            email,
            phone,
            company,
            address,
            status,
            source,
            assigned_to,
            tags,
            notes,
            total_value,
            whatsapp_number,
            service
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          sanitizeParams(
            customerId,
            customerData.name || lead.name,
            lead.email,
            customerData.phone || lead.phone,
            customerData.company || lead.company,
            address,
            "active",
            lead.source,
            assignedTo,
            JSON.stringify(tagsArray),
            customerData.notes || lead.notes,
            customerData.totalValue || lead.estimated_value,
            customerData.whatsappNumber || lead.whatsapp_number,
            service
          )
        );

        // Mark lead as converted and store link
        await connection.execute(
          "UPDATE leads SET status = 'closed-won', converted_customer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          sanitizeParams(customerId, id)
        );

        // Re-link tasks from lead to customer
        await connection.execute(
          'UPDATE tasks SET related_type = "customer", related_id = ? WHERE related_type = "lead" AND related_id = ?',
          sanitizeParams(customerId, id)
        );

        await connection.commit();

        const [customers] = await pool.execute(
          `
          SELECT 
            c.*,
            u.name AS assigned_user_name
          FROM customers c
          LEFT JOIN users u ON c.assigned_to = u.id
          WHERE c.id = ?
        `,
          sanitizeParams(customerId)
        );

        const customer = customers[0];

        // Safe tags parsing
        try {
          if (customer.tags && typeof customer.tags === "string") {
            if (customer.tags.trim() !== "") {
              customer.tags = JSON.parse(customer.tags);
            } else {
              customer.tags = [];
            }
          } else if (!customer.tags) {
            customer.tags = [];
          }
        } catch (e) {
          console.error(
            "Failed to parse customer.tags for customer",
            customer.id,
            e
          );
          customer.tags = [];
        }

        res.json({
          message: "Lead converted to customer successfully",
          customer,
        });
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error("Lead conversion error:", error);
      res.status(500).json({ error: "Failed to convert lead to customer" });
    }
  }
);



router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const access = await ensureCanAccessLead(req, res, id);
    if (!access.ok) return;

    const [existingLeads] = await pool.execute(
      "SELECT id FROM leads WHERE id = ?",
      sanitizeParams(id)
    );

    if (existingLeads.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    await pool.execute("DELETE FROM leads WHERE id = ?", sanitizeParams(id));

    res.json({ message: "Lead deleted successfully" });
  } catch (error) {
    console.error("Lead deletion error:", error);
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

module.exports = router;


