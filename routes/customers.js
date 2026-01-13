const { v4: uuidv4 } = require("uuid");
const express = require("express");
const { body, validationResult, query } = require("express-validator");
const { pool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

const sanitizeParams = (...params) => {
  return params.map((param) => (param === undefined ? null : param));
};

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

const parseTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
};

const customerFieldMap = {
  name: "name",
  email: "email",
  phone: "phone",
  company: "company",
  address: "address",
  city: "city",
  state: "state",
  zipCode: "zip_code",
  country: "country",
  status: "status",
  source: "source",
  tags: "tags",
  notes: "notes",
  totalValue: "total_value",
  whatsappNumber: "whatsapp_number",
  service: "service",

  // service type + pricing breakdown
  serviceType: "service_type",
  oneTimePrice: "one_time_price",
  monthlyPrice: "monthly_price",
  manualPrice: "manual_price",

  // invoice defaults
  defaultTaxRate: "default_tax_rate",
  defaultDueDays: "default_due_days",
  defaultInvoiceNotes: "default_invoice_notes",

  // recurring
  recurringEnabled: "recurring_enabled",
  recurringInterval: "recurring_interval",
  recurringAmount: "recurring_amount",
  recurringService: "recurring_service",

  // renewals
  nextRenewalDate: "next_renewal_date",
  defaultRenewalStatus: "default_renewal_status",
  defaultRenewalReminderDays: "default_renewal_reminder_days",
  defaultRenewalNotes: "default_renewal_notes",
};

// ✅ AUTO-INVOICE HELPER
const createAutoInvoice = async (customerId, customer, userId) => {
  try {
    // Get next invoice number (INV-001, INV-002...)
    const [lastInvoice] = await pool.execute(
      "SELECT invoice_number FROM invoices ORDER BY created_at DESC LIMIT 1"
    );

    const nextNumber =
      lastInvoice.length > 0
        ? parseInt(lastInvoice[0].invoice_number.replace("INV-", ""), 10) + 1
        : 1;

    const invoiceNumber = `INV-${nextNumber.toString().padStart(3, "0")}`;

    // Avoid duplicate invoice_number (race-safety basic check)
    const [existingInvoice] = await pool.execute(
      "SELECT id FROM invoices WHERE invoice_number = ?",
      sanitizeParams(invoiceNumber)
    );
    if (existingInvoice.length > 0) {
      console.warn(
        `Duplicate invoice number ${invoiceNumber}, skipping auto invoice`
      );
      return null;
    }

    const invoiceAmount =
      customer.one_time_price ||
      customer.monthly_price ||
      customer.total_value ||
      0;

    const taxRate = customer.default_tax_rate || 18;
    const dueDays = customer.default_due_days || 30;
    const serviceName = customer.service || "Service Charges";

   const invoiceId = uuidv4()

// Insert invoice
await pool.execute(
  `INSERT INTO invoices (
    id,
    customer_id,
    invoice_number,
    amount,
    tax,
    total,
    status,
    due_date,
    notes
  )
  VALUES (
    ?, ?, ?, ?, ?, ?, 'draft', DATE_ADD(NOW(), INTERVAL ? DAY), ?
  )`,
  sanitizeParams(
    invoiceId, // id
    customerId, // customer_id
    invoiceNumber, // invoice_number
    invoiceAmount, // amount
    taxRate, // tax
    invoiceAmount + (invoiceAmount * taxRate) / 100, // total
    dueDays, // INTERVAL ? DAY -> due_date
    `Auto-generated invoice for ${serviceName}. Total Value: ₹${invoiceAmount}` // notes
  )
)


    // Insert single invoice item
    await pool.execute(
      `INSERT INTO invoice_items (
        id,
        invoice_id,
        description,
        quantity,
        rate,
        amount
      )
      VALUES (?, ?, ?, 1, ?, ?)`,
      sanitizeParams(
        uuidv4(),
        invoiceId,
        serviceName,
        invoiceAmount,
        invoiceAmount
      )
    );

    console.log(
      `✅ Auto-created invoice ${invoiceNumber} for customer ${customerId}`
    );

    return {
      id: invoiceId,
      invoiceNumber,
      amount: invoiceAmount,
      total: invoiceAmount + (invoiceAmount * taxRate) / 100,
      status: "draft",
    };
  } catch (error) {
    console.error("Auto-invoice creation failed:", error);
    return null; // Do not block customer creation
  }
};

// GET all customers with filtering and pagination
router.get(
  "/",
  authenticateToken,
  [
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("search").optional().isString(),
    query("status").optional().isIn(["active", "inactive", "prospect"]),
    query("assignedTo").optional().isString(),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const rawPage = parseInt(req.query.page, 10);
      const rawLimit = parseInt(req.query.limit, 10);

      const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
      const limit =
        Number.isNaN(rawLimit) || rawLimit < 1
          ? 10
          : rawLimit > 100
          ? 100
          : rawLimit;

      const offset = (page - 1) * limit;

      const { search, status, assignedTo } = req.query;

      let whereClause = "WHERE 1=1";
      const queryParams = [];

      if (req.user.role !== "admin") {
        whereClause += " AND c.assigned_to = ?";
        queryParams.push(req.user.userId);
      } else if (assignedTo) {
        whereClause += " AND c.assigned_to = ?";
        queryParams.push(assignedTo);
      }

      if (search) {
        whereClause +=
          " AND (c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ? OR c.phone LIKE ?)";
        const searchTerm = `%${search}%`;
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
      }

      if (status) {
        whereClause += " AND c.status = ?";
        queryParams.push(status);
      }

      const customersSql = `
        SELECT 
          c.*,
          u.name AS assigned_user_name
        FROM customers c
        LEFT JOIN users u ON c.assigned_to = u.id
        ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT ${Number(limit)} OFFSET ${Number(offset)}
      `;

      const [customers] = await pool.execute(
        customersSql,
        sanitizeParams(...queryParams)
      );

      const countSql = `SELECT COUNT(*) AS total FROM customers c ${whereClause}`;
      const [countResult] = await pool.execute(
        countSql,
        sanitizeParams(...queryParams)
      );

      const total = countResult[0]?.total || 0;
      const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

      res.json({
        customers: customers.map((customer) => ({
          ...customer,
          tags: parseTags(customer.tags),
        })),
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
      console.error("Customers fetch error:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  }
);

// Helper: ensure current user can access a specific customer
// const ensureCanAccessCustomer = async (req, res, customerId) => {
//   if (req.user.role === "admin" ) return { ok: true };

//   const [rows] = await pool.execute(
//     "SELECT id FROM customers WHERE id = ? AND assigned_to = ?",
//     sanitizeParams(customerId, req.user.userId)
//   );

//   if (rows.length === 0) {
//     return {
//       ok: false,
//       response: res
//         .status(403)
//         .json({ error: "You do not have permission to access this customer" }),
//     };
//   }

//   return { ok: true };
// };


// Helper: ensure current user can access a specific customer
const ensureCanAccessCustomer = async (req, res, customerId) => {
  // If you still want admins to always pass:
  if (req.user.role === "admin") return { ok: true }

  // ✅ For now, allow all authenticated users to access any customer
  return { ok: true }
}


// GET customer by ID (with related)
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const access = await ensureCanAccessCustomer(req, res, id);
    if (!access.ok) return;

    const [customers] = await pool.execute(
      `
      SELECT 
        c.*,
        u.name AS assigned_user_name
      FROM customers c
      LEFT JOIN users u ON c.assigned_to = u.id
      WHERE c.id = ?
    `,
      sanitizeParams(id)
    );

    if (customers.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customers[0];
    customer.tags = parseTags(customer.tags);

    const [deals] = await pool.execute(
      "SELECT id, title, value, stage, probability FROM deals WHERE customer_id = ?",
      sanitizeParams(id)
    );

    const [tasks] = await pool.execute(
      'SELECT id, title, type, status, due_date FROM tasks WHERE related_type = "customer" AND related_id = ?',
      sanitizeParams(id)
    );

    const [invoices] = await pool.execute(
      "SELECT id, invoice_number, total, status, due_date FROM invoices WHERE customer_id = ?",
      sanitizeParams(id)
    );

    res.json({
      customer,
      related: {
        deals,
        tasks,
        invoices,
      },
    });
  } catch (error) {
    console.error("Customer fetch error:", error);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

// CREATE customer + auto-invoice
router.post(
  "/",
  authenticateToken,
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone").optional().isString(),
    body("company").optional().isString(),
    body("address").optional().isString(),
    body("city").optional().isString(),
    body("state").optional().isString(),
    body("zipCode").optional().isString(),
    body("country").optional().isString(),
    body("status").optional().isIn(["active", "inactive", "prospect"]),
    body("source").optional().isString(),
    body("tags").optional().isArray(),
    body("notes").optional().isString(),
    body("totalValue").optional().isNumeric(),
    body("whatsappNumber").optional().isString(),

    body("service").optional().isString(),
    body("serviceType")
      .optional()
      .isIn(["whatsapp_api", "website_dev", "ai_agent"]),
    body("oneTimePrice").optional().isNumeric(),
    body("monthlyPrice").optional().isNumeric(),
    body("manualPrice").optional().isNumeric(),

    body("defaultTaxRate").optional().isNumeric(),
    body("defaultDueDays").optional().isInt(),
    body("defaultInvoiceNotes").optional().isString(),

    body("recurringEnabled").optional().isBoolean(),
    body("recurringInterval")
      .optional()
      .isIn(["monthly", "yearly"]),
    body("recurringAmount").optional().isNumeric(),
    body("recurringService").optional().isString(),

    body("nextRenewalDate").optional().isISO8601(),
    body("defaultRenewalStatus")
      .optional()
      .isIn(["active", "expiring", "expired", "renewed"]),
    body("defaultRenewalReminderDays").optional().isInt(),
    body("defaultRenewalNotes").optional().isString(),

    body("leadId").optional().isString(),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      let {
        name,
        email,
        phone,
        company,
        address,
        city,
        state,
        zipCode,
        country,
        status = "prospect",
        source,
        tags = [],
        notes,
        totalValue,
        whatsappNumber,
        service,
        serviceType,
        oneTimePrice,
        monthlyPrice,
        manualPrice,
        leadId,
        defaultTaxRate,
        defaultDueDays,
        defaultInvoiceNotes,
        recurringEnabled,
        recurringInterval,
        recurringAmount,
        recurringService,
        nextRenewalDate,
        defaultRenewalStatus,
        defaultRenewalReminderDays,
        defaultRenewalNotes,
      } = req.body;

      const assignedTo = req.user.userId;
      const id = uuidv4();

      // Auto-populate service from lead if missing
      if (leadId && (!service || !serviceType)) {
        const [lead] = await pool.execute(
          "SELECT service FROM leads WHERE id = ?",
          sanitizeParams(leadId)
        );

        if (lead.length > 0 && lead[0].service) {
          service = lead[0].service;
          serviceType =
            service === "WhatsApp Business API"
              ? "whatsapp_api"
              : service === "Website Development"
              ? "website_dev"
              : service === "AI Agent"
              ? "ai_agent"
              : serviceType;

          notes = notes
            ? `${notes}\n\n[From Lead #${leadId}] Service: ${service}`
            : `[From Lead #${leadId}] Service: ${service}`;
        }
      }

      const totalValueNumber =
        totalValue !== undefined && totalValue !== null && totalValue !== ""
          ? Number(totalValue)
          : 0;

      const [existingCustomers] = await pool.execute(
        "SELECT id FROM customers WHERE email = ?",
        sanitizeParams(email)
      );

      if (existingCustomers.length > 0) {
        return res
          .status(400)
          .json({ error: "Customer with this email already exists" });
      }

      await pool.execute(
        `
        INSERT INTO customers (
          id,
          name,
          email,
          phone,
          company,
          address,
          city,
          state,
          zip_code,
          country,
          status,
          source,
          assigned_to,
          tags,
          notes,
          last_contact_date,
          total_value,
          one_time_price,
          monthly_price,
          manual_price,
          default_tax_rate,
          default_due_days,
          default_invoice_notes,
          whatsapp_number,
          service,
          service_type,
          recurring_enabled,
          recurring_interval,
          recurring_amount,
          recurring_service,
          next_renewal_date,
          default_renewal_status,
          default_renewal_reminder_days,
          default_renewal_notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        sanitizeParams(
          id,
          name,
          email,
          phone,
          company,
          address,
          city,
          state,
          zipCode,
          country || "India",
          status || "prospect",
          source,
          assignedTo,
          JSON.stringify(tags || []),
          notes,
          null,
          totalValueNumber,
          oneTimePrice != null && oneTimePrice !== "" ? Number(oneTimePrice) : null,
          monthlyPrice != null && monthlyPrice !== "" ? Number(monthlyPrice) : null,
          manualPrice != null && manualPrice !== "" ? Number(manualPrice) : null,
          defaultTaxRate,
          defaultDueDays,
          defaultInvoiceNotes,
          whatsappNumber,
          service,
          serviceType || null,
          recurringEnabled ? 1 : 0,
          recurringInterval || "monthly",
          recurringAmount,
          recurringService,
          nextRenewalDate,
          defaultRenewalStatus,
          defaultRenewalReminderDays,
          defaultRenewalNotes
        )
      );

      const [customers] = await pool.execute(
        `
        SELECT 
          c.*,
          u.name AS assigned_user_name
        FROM customers c
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.id = ?
        `,
        sanitizeParams(id)
      );

      const customer = customers[0];
      customer.tags = parseTags(customer.tags);

      // ✅ AUTO-INVOICE CALL
      const autoInvoice = await createAutoInvoice(id, customer, req.user.userId);

      res.status(201).json({
        message: `Customer created successfully${
          leadId ? ` from lead #${leadId}` : ""
        }`,
        customer,
        invoice: autoInvoice,
      });
    } catch (error) {
      console.error("Customer creation error:", error);
      res.status(500).json({ error: "Failed to create customer" });
    }
  }
);

// UPDATE customer
router.put(
  "/:id",
  authenticateToken,
  [
    body("name").optional().trim().notEmpty(),
    body("email").optional().isEmail(),
    body("phone").optional().isString(),
    body("company").optional().isString(),
    body("address").optional().isString(),
    body("city").optional().isString(),
    body("state").optional().isString(),
    body("zipCode").optional().isString(),
    body("country").optional().isString(),
    body("status").optional().isIn(["active", "inactive", "prospect"]),
    body("source").optional().isString(),
    body("tags").optional().isArray(),
    body("notes").optional().isString(),
    body("totalValue").optional().isNumeric(),
    body("whatsappNumber").optional().isString(),

    body("service").optional().isString(),
    body("serviceType")
      .optional()
      .isIn(["whatsapp_api", "website_dev", "ai_agent"]),
    body("oneTimePrice").optional().isNumeric(),
    body("monthlyPrice").optional().isNumeric(),
    body("manualPrice").optional().isNumeric(),

    body("defaultTaxRate").optional().isNumeric(),
    body("defaultDueDays").optional().isInt(),
    body("defaultInvoiceNotes").optional().isString(),

    body("recurringEnabled").optional().isBoolean(),
    body("recurringInterval")
      .optional()
      .isIn(["monthly", "yearly"]),
    body("recurringAmount").optional().isNumeric(),
    body("recurringService").optional().isString(),

    body("nextRenewalDate").optional().isISO8601(),
    body("defaultRenewalStatus")
      .optional()
      .isIn(["active", "expiring", "expired", "renewed"]),
    body("defaultRenewalReminderDays").optional().isInt(),
    body("defaultRenewalNotes").optional().isString(),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { id } = req.params;
      const updateData = { ...req.body };

      const access = await ensureCanAccessCustomer(req, res, id);
      if (!access.ok) return;

      const [existingCustomers] = await pool.execute(
        "SELECT id FROM customers WHERE id = ?",
        sanitizeParams(id)
      );

      if (existingCustomers.length === 0) {
        return res.status(404).json({ error: "Customer not found" });
      }

      if (updateData.email) {
        const [emailCheck] = await pool.execute(
          "SELECT id FROM customers WHERE email = ? AND id != ?",
          sanitizeParams(updateData.email, id)
        );

        if (emailCheck.length > 0) {
          return res
            .status(400)
            .json({ error: "Email already exists for another customer" });
        }
      }

      if (Object.prototype.hasOwnProperty.call(updateData, "totalValue")) {
        const raw = updateData.totalValue;
        updateData.totalValue =
          raw !== undefined && raw !== null && raw !== "" ? Number(raw) : 0;
      }

      if (Object.prototype.hasOwnProperty.call(updateData, "recurringEnabled")) {
        updateData.recurringEnabled = updateData.recurringEnabled ? 1 : 0;
      }

      ["oneTimePrice", "monthlyPrice", "manualPrice"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(updateData, key)) {
          const raw = updateData[key];
          updateData[key] =
            raw !== undefined && raw !== null && raw !== "" ? Number(raw) : null;
        }
      });

      const updateFields = [];
      const updateValues = [];

      Object.entries(updateData).forEach(([key, value]) => {
        if (value === undefined) return;
        const dbField = customerFieldMap[key];
        if (!dbField) return;

        if (key === "tags") {
          updateFields.push(`${dbField} = ?`);
          updateValues.push(JSON.stringify(value));
        } else {
          updateFields.push(`${dbField} = ?`);
          updateValues.push(value);
        }
      });

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updateValues.push(id);

      await pool.execute(
        `UPDATE customers SET ${updateFields.join(
          ", "
        )}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        sanitizeParams(...updateValues)
      );

      const [customers] = await pool.execute(
        `
        SELECT 
          c.*,
          u.name AS assigned_user_name
        FROM customers c
        LEFT JOIN users u ON c.assigned_to = u.id
        WHERE c.id = ?
        `,
        sanitizeParams(id)
      );

      const customer = customers[0];
      customer.tags = parseTags(customer.tags);

      res.json({
        message: "Customer updated successfully",
        customer,
      });
    } catch (error) {
      console.error("Customer update error:", error);
      res.status(500).json({ error: "Failed to update customer" });
    }
  }
);

// DELETE customer
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const access = await ensureCanAccessCustomer(req, res, id);
    if (!access.ok) return;

    const [existingCustomers] = await pool.execute(
      "SELECT id FROM customers WHERE id = ?",
      sanitizeParams(id)
    );

    if (existingCustomers.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const [deals] = await pool.execute(
      "SELECT COUNT(*) as count FROM deals WHERE customer_id = ?",
      sanitizeParams(id)
    );

    const [invoices] = await pool.execute(
      "SELECT COUNT(*) as count FROM invoices WHERE customer_id = ?",
      sanitizeParams(id)
    );

    if (deals[0].count > 0 || invoices[0].count > 0) {
      return res.status(400).json({
        error: "Cannot delete customer with existing deals or invoices",
        details: {
          deals: deals[0].count,
          invoices: invoices[0].count,
        },
      });
    }

    await pool.execute("DELETE FROM customers WHERE id = ?", sanitizeParams(id));

    res.json({
      message: "Customer deleted successfully",
      id,
    });
  } catch (error) {
    console.error("Customer deletion error:", error);
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

// Move customer back to lead (unchanged from your original)
router.post("/:id/move-to-lead", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const access = await ensureCanAccessCustomer(req, res, id);
    if (!access.ok) return;

    const [customers] = await pool.execute(
      "SELECT * FROM customers WHERE id = ?",
      sanitizeParams(id)
    );

    if (customers.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customer = customers[0];
    const leadId = uuidv4();

    await pool.execute(
      `
      INSERT INTO leads (
        id,
        name, email, phone, company, source, status, priority,
        assigned_to, converted_customer_id, estimated_value, notes,
        expected_close_date, whatsapp_number, service
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      sanitizeParams(
        leadId,
        customer.name,
        customer.email,
        customer.phone,
        customer.company,
        customer.source || "website",
        "new",
        "medium",
        customer.assigned_to,
        null,
        customer.total_value || 0,
        (customer.notes || "") + "\n\n[Auto] Restored from customer.",
        null,
        customer.whatsapp_number,
        customer.service || null
      )
    );

    await pool.execute(
      `UPDATE customers 
       SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      sanitizeParams(id)
    );

    await pool.execute(
      'UPDATE tasks SET related_type = "lead", related_id = ? WHERE related_type = "customer" AND related_id = ?',
      sanitizeParams(leadId, id)
    );

    return res.json({
      message: "Customer moved back to lead successfully",
      leadId,
    });
  } catch (error) {
    console.error("Move customer to lead error:", error);
    return res.status(500).json({ error: "Failed to move customer to lead" });
  }
});

module.exports = router;
