
const express = require("express")
const { body, validationResult, query } = require("express-validator")
const { pool } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

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

const parseProducts = (value) => {
  if (!value) return []
  try {
    if (typeof value === 'string') {
      return JSON.parse(value)
    }
    if (Array.isArray(value)) {
      return value
    }
    return []
  } catch {
    return []
  }
}

const dealFieldMap = {
  title: "title",
  customerId: "customer_id",
  value: "value",
  stage: "stage",
  probability: "probability",
  expectedCloseDate: "expected_close_date",
  actualCloseDate: "actual_close_date",
  assignedTo: "assigned_to",
  products: "products",
  notes: "notes",
}

// Get all deals with filtering and pagination - FIXED VALIDATION
router.get(
  "/",
  authenticateToken,
  [
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    query("search").optional().isString().withMessage("Search must be a string"),
    query("stage")      // ✅ FIXED: Added .isIn() before .withMessage()
      .optional()
      .isIn([
        "prospecting",
        "qualification",
        "proposal",
        "negotiation",
        "closed-won",
        "closed-lost",
      ])
      .withMessage("Invalid stage"),
    query("customerId").optional().isString().withMessage("Customer ID must be a string"),
    query("assignedTo").optional().isString().withMessage("AssignedTo must be a string"),
    query("minValue").optional().isNumeric().withMessage("Min value must be numeric"),
    query("maxValue").optional().isNumeric().withMessage("Max value must be numeric"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

     // inside router.get("/", ...)

const page = Math.max(1, parseInt(req.query.page, 10) || 1)
const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10))
const offset = (page - 1) * limit

const { search, status, stage, assignedTo } = req.query

let whereClause = "WHERE 1=1"
const queryParams = []

if (search) {
  whereClause +=
    " AND (d.title LIKE ? OR c.name LIKE ? OR c.company LIKE ?)"
  const searchTerm = `%${search}%`
  queryParams.push(searchTerm, searchTerm, searchTerm)
}

if (status) {
  whereClause += " AND d.status = ?"
  queryParams.push(status)
}

if (stage) {
  whereClause += " AND d.stage = ?"
  queryParams.push(stage)
}

if (assignedTo) {
  whereClause += " AND d.assigned_to = ?"
  queryParams.push(assignedTo)
}

const dealsSql = `
  SELECT 
    d.*,
    c.name AS customer_name,
    c.company AS customer_company,
    u.name AS assigned_user_name
  FROM deals d
  LEFT JOIN customers c ON d.customer_id = c.id
  LEFT JOIN users u ON d.assigned_to = u.id
  ${whereClause}
  ORDER BY d.created_at DESC
  LIMIT ? OFFSET ?
`

const dealsParams = [...queryParams, String(limit), String(offset)]
const [deals] = await pool.execute(dealsSql, dealsParams)

const countSql = `
  SELECT COUNT(*) AS total
  FROM deals d
  LEFT JOIN customers c ON d.customer_id = c.id
  LEFT JOIN users u ON d.assigned_to = u.id
  ${whereClause}
`
const [countResult] = await pool.execute(countSql, queryParams)

const total = countResult[0]?.total || 0
const totalPages = Math.ceil(total / limit) || 1

res.json({
  deals,
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
      console.error("Deals fetch error:", error)
      res.status(500).json({ error: "Failed to fetch deals" })
    }
  },
)

// Get deal by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const [deals] = await pool.execute(
      `
      SELECT 
        d.*,
        c.name AS customer_name,
        c.company AS customer_company,
        c.email AS customer_email,
        c.phone AS customer_phone,
        u.name AS assigned_user_name
      FROM deals d
      LEFT JOIN customers c ON d.customer_id = c.id
      LEFT JOIN users u ON d.assigned_to = u.id
      WHERE d.id = ?
    `,
      [id],
    )

    if (deals.length === 0) {
      return res.status(404).json({ error: "Deal not found" })
    }

    const deal = deals[0]
    deal.products = parseProducts(deal.products)

    const [tasks] = await pool.execute(
      'SELECT id, title, type, status, priority, due_date FROM tasks WHERE related_type = "deal" AND related_id = ?',
      [id],
    )

    res.json({
      deal,
      related: {
        tasks,
      },
    })
  } catch (error) {
    console.error("Deal fetch error:", error)
    res.status(500).json({ error: "Failed to fetch deal" })
  }
})

// Create new deal
router.post(
  "/",
  authenticateToken,
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("customerId").notEmpty().withMessage("Customer ID is required"),
    body("value").isNumeric().withMessage("Value must be numeric"),
    body("stage")
      .optional()
      .isIn([
        "prospecting",
        "qualification",
        "proposal",
        "negotiation",
        "closed-won",
        "closed-lost",
      ])
      .withMessage("Invalid stage"),
    body("probability")
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage("Probability must be between 0 and 100"),
    body("expectedCloseDate")
      .optional()
      .isISO8601()
      .withMessage("Expected close date must be a valid date"),
    body("assignedTo")
      .optional()
      .isString()
      .withMessage("AssignedTo must be a string"),
    body("products").optional().isArray().withMessage("Products must be an array"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
  ],
  async (req, res) => {
    try {
      console.log("=== DEAL CREATE REQUEST ===")
      console.log("Request body:", req.body)

      const validationError = handleValidation(req, res)
      if (validationError) return

      const {
        title,
        customerId,
        value,
        stage = "prospecting",
        probability = 50,
        expectedCloseDate,
        actualCloseDate,
        assignedTo: rawAssignedTo,
        products = [],
        notes = "",
      } = req.body

      const [customers] = await pool.execute(
        "SELECT id FROM customers WHERE id = ?",
        [customerId],
      )

      if (customers.length === 0) {
        return res.status(400).json({ error: "Customer not found" })
      }

      let assignedTo = rawAssignedTo || null
      if (assignedTo === "" || assignedTo === "0" || assignedTo === 0) {
        assignedTo = null
      }
      
      if (assignedTo) {
        const [userRows] = await pool.execute(
          "SELECT id FROM users WHERE id = ?",
          [assignedTo],
        )
        if (userRows.length === 0) {
          console.warn(`User with ID ${assignedTo} not found, setting assignedTo to null`)
          assignedTo = null
        }
      }

      let productsArray = []
      if (products) {
        if (Array.isArray(products)) {
          productsArray = products
        } else if (typeof products === 'string') {
          try {
            productsArray = JSON.parse(products)
          } catch (e) {
            console.error("Failed to parse products string:", products, e)
            productsArray = []
          }
        }
      }

      let expectedCloseDateFormatted = null
      if (expectedCloseDate) {
        try {
          const date = new Date(expectedCloseDate)
          if (!isNaN(date.getTime())) {
            expectedCloseDateFormatted = date.toISOString().split('T')[0]
          }
        } catch (e) {
          console.error("Invalid expectedCloseDate:", expectedCloseDate, e)
        }
      }

      let actualCloseDateFormatted = null
      if (actualCloseDate) {
        try {
          const date = new Date(actualCloseDate)
          if (!isNaN(date.getTime())) {
            actualCloseDateFormatted = date.toISOString().split('T')[0]
          }
        } catch (e) {
          console.error("Invalid actualCloseDate:", actualCloseDate, e)
        }
      }

      const [result] = await pool.execute(
        `
        INSERT INTO deals (
          title, customer_id, value, stage, probability, expected_close_date,
          actual_close_date, assigned_to, products, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          title,
          customerId,
          value,
          stage,
          probability,
          expectedCloseDateFormatted,
          actualCloseDateFormatted,
          assignedTo,
          JSON.stringify(productsArray),
          notes,
        ],
      )

      const [deals] = await pool.execute(
        `
        SELECT 
          d.*,
          c.name AS customer_name,
          c.company AS customer_company,
          u.name AS assigned_user_name
        FROM deals d
        LEFT JOIN customers c ON d.customer_id = c.id
        LEFT JOIN users u ON d.assigned_to = u.id
        WHERE d.id = ?
      `,
        [result.insertId],
      )

      const deal = deals[0]
      if (deal) {
        deal.products = parseProducts(deal.products)
      }

      res.status(201).json({
        message: "Deal created successfully",
        deal,
      })
    } catch (error) {
      console.error("Deal creation error:", error)
      res.status(500).json({ 
        error: "Failed to create deal",
        details: error.message 
      })
    }
  },
)

// Update deal - FIXED VALIDATION
router.put(
  "/:id",
  authenticateToken,
  [
    body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
    body("customerId").optional().notEmpty().withMessage("Customer ID cannot be empty"),
    body("value").optional().isNumeric().withMessage("Value must be numeric"),
    body("stage")
      .optional()
      .isIn([
        "prospecting",
        "qualification",
        "proposal",
        "negotiation",
        "closed-won",
        "closed-lost",
      ])
      .withMessage("Invalid stage"),
    body("probability")
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage("Probability must be between 0 and 100"),
    body("expectedCloseDate")
      .optional()
      .isISO8601()
      .withMessage("Expected close date must be a valid date"),
    body("actualCloseDate")
      .optional()
      .isISO8601()
      .withMessage("Actual close date must be a valid date"),
    body("assignedTo").optional().isString().withMessage("AssignedTo must be a string"),
    body("products").optional().isArray().withMessage("Products must be an array"),
    body("notes").optional().isString().withMessage("Notes must be a string"),
  ],
  async (req, res) => {
    try {
      console.log("=== DEAL UPDATE REQUEST ===")
      console.log("Deal ID:", req.params.id)
      console.log("Request body:", req.body)

      const validationError = handleValidation(req, res)
      if (validationError) return

      const { id } = req.params
      const updateData = { ...req.body }

      const [existingDeals] = await pool.execute(
        "SELECT id FROM deals WHERE id = ?",
        [id],
      )

      if (existingDeals.length === 0) {
        return res.status(404).json({ error: "Deal not found" })
      }

      if (updateData.customerId) {
        const [customers] = await pool.execute(
          "SELECT id FROM customers WHERE id = ?",
          [updateData.customerId],
        )

        if (customers.length === 0) {
          return res.status(400).json({ error: "Customer not found" })
        }
      }

      if (Object.prototype.hasOwnProperty.call(updateData, "assignedTo")) {
        let assignedTo = updateData.assignedTo || null
        if (assignedTo === "" || assignedTo === "0" || assignedTo === 0) {
          assignedTo = null
        }
        if (assignedTo) {
          const [userRows] = await pool.execute(
            "SELECT id FROM users WHERE id = ?",
            [assignedTo],
          )
          if (userRows.length === 0) {
            console.warn(`User with ID ${assignedTo} not found, setting assignedTo to null`)
            assignedTo = null
          }
        }
        updateData.assignedTo = assignedTo
      }

      if (updateData.products) {
        if (Array.isArray(updateData.products)) {
          updateData.products = JSON.stringify(updateData.products)
        } else if (typeof updateData.products === 'string') {
        } else {
          updateData.products = JSON.stringify([])
        }
      }

      if (updateData.expectedCloseDate) {
        try {
          const date = new Date(updateData.expectedCloseDate)
          if (!isNaN(date.getTime())) {
            updateData.expectedCloseDate = date.toISOString().split('T')[0]
          }
        } catch (e) {
          console.error("Invalid expectedCloseDate:", updateData.expectedCloseDate, e)
          delete updateData.expectedCloseDate
        }
      }

      if (updateData.actualCloseDate) {
        try {
          const date = new Date(updateData.actualCloseDate)
          if (!isNaN(date.getTime())) {
            updateData.actualCloseDate = date.toISOString().split('T')[0]
          }
        } catch (e) {
          console.error("Invalid actualCloseDate:", updateData.actualCloseDate, e)
          delete updateData.actualCloseDate
        }
      }

      const updateFields = []
      const updateValues = []

      Object.entries(updateData).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          const dbField = dealFieldMap[key]
          if (!dbField) return
          
          updateFields.push(`${dbField} = ?`)
          updateValues.push(null)
          return
        }
        
        const dbField = dealFieldMap[key]
        if (!dbField) return

        updateFields.push(`${dbField} = ?`)
        updateValues.push(value)
      })

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No fields to update" })
      }

      updateValues.push(id)

      const updateSql = `UPDATE deals SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      
      console.log("Update SQL:", updateSql)
      console.log("Update values:", updateValues)

      await pool.execute(updateSql, updateValues)

      const [deals] = await pool.execute(
        `
        SELECT 
          d.*,
          c.name AS customer_name,
          c.company AS customer_company,
          u.name AS assigned_user_name
        FROM deals d
        LEFT JOIN customers c ON d.customer_id = c.id
        LEFT JOIN users u ON d.assigned_to = u.id
        WHERE d.id = ?
      `,
        [id],
      )

      const deal = deals[0]
      if (deal) {
        deal.products = parseProducts(deal.products)
      }

      res.json({
        message: "Deal updated successfully",
        deal,
      })
    } catch (error) {
      console.error("Deal update error:", error)
      res.status(500).json({ 
        error: "Failed to update deal",
        details: error.message 
      })
    }
  },
)

// Delete deal
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const [existingDeals] = await pool.execute(
      "SELECT id FROM deals WHERE id = ?",
      [id],
    )

    if (existingDeals.length === 0) {
      return res.status(404).json({ error: "Deal not found" })
    }

    await pool.execute("DELETE FROM deals WHERE id = ?", [id])

    res.json({ message: "Deal deleted successfully" })
  } catch (error) {
    console.error("Deal deletion error:", error)
    res.status(500).json({ error: "Failed to delete deal" })
  }
})

// Get deals pipeline summary
router.get("/pipeline/summary", authenticateToken, async (req, res) => {
  try {
    const [pipelineData] = await pool.execute(`
      SELECT 
        stage,
        COUNT(*) AS count,
        SUM(value) AS total_value,
        AVG(probability) AS avg_probability
      FROM deals 
      WHERE stage NOT IN ('closed-won', 'closed-lost')
      GROUP BY stage
      ORDER BY 
        CASE stage
          WHEN 'prospecting' THEN 1
          WHEN 'qualification' THEN 2
          WHEN 'proposal' THEN 3
          WHEN 'negotiation' THEN 4
        END
    `)

    const [closedDeals] = await pool.execute(`
      SELECT 
        stage,
        COUNT(*) AS count,
        SUM(value) AS total_value
      FROM deals 
      WHERE stage IN ('closed-won', 'closed-lost')
      GROUP BY stage
    `)

    res.json({
      pipeline: pipelineData,
      closed: closedDeals,
    })
  } catch (error) {
    console.error("Pipeline summary error:", error)
    res.status(500).json({ error: "Failed to fetch pipeline summary" })
  }
})

module.exports = router
