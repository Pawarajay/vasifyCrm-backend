const express = require("express")
const { body, validationResult, query } = require("express-validator")
const { pool } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

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

const taskFieldMap = {
  title: "title",
  description: "description",
  type: "type",
  priority: "priority",
  status: "status",
  assignedTo: "assigned_to",
  dueDate: "due_date",
}

// Get all tasks with filtering and pagination
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
    query("type")
      .optional()
      .isIn(["call", "email", "meeting", "follow-up", "demo", "other"])
      .withMessage("Invalid type"),
    query("priority").optional().isIn(["low", "medium", "high"]).withMessage("Invalid priority"),
    query("status")
      .optional()
      .isIn(["pending", "in-progress", "completed", "cancelled"])
      .withMessage("Invalid status"),
    query("assignedTo").optional().isString().withMessage("AssignedTo must be a string"),
    query("relatedType")
      .optional()
      .isIn(["customer", "lead", "deal"])
      .withMessage("Invalid related type"),
    query("relatedId").optional().isString().withMessage("Related ID must be a string"),
    query("dueDateFrom")
      .optional()
      .isISO8601()
      .withMessage("Due date from must be a valid date"),
    query("dueDateTo")
      .optional()
      .isISO8601()
      .withMessage("Due date to must be a valid date"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const pageRaw = Number.parseInt(req.query.page, 10)
      const limitRaw = Number.parseInt(req.query.limit, 10)

      const page = !Number.isNaN(pageRaw) && pageRaw > 0 ? pageRaw : 1
      const limit =
        !Number.isNaN(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 10
      const offset = (page - 1) * limit

      if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
        return res.status(400).json({ error: "Invalid pagination parameters" })
      }

      const {
        search,
        type,
        priority,
        status,
        assignedTo,
        relatedType,
        relatedId,
        dueDateFrom,
        dueDateTo,
      } = req.query

      let whereClause = "WHERE 1=1"
      const queryParams = []

      if (search) {
        whereClause += " AND (t.title LIKE ? OR t.description LIKE ?)"
        const searchTerm = `%${search}%`
        queryParams.push(searchTerm, searchTerm)
      }

      if (type) {
        whereClause += " AND t.type = ?"
        queryParams.push(type)
      }

      if (priority) {
        whereClause += " AND t.priority = ?"
        queryParams.push(priority)
      }

      if (status) {
        whereClause += " AND t.status = ?"
        queryParams.push(status)
      }

      if (assignedTo) {
        whereClause += " AND t.assigned_to = ?"
        queryParams.push(assignedTo)
      }

      if (relatedType) {
        whereClause += " AND t.related_type = ?"
        queryParams.push(relatedType)
      }

      if (relatedId) {
        whereClause += " AND t.related_id = ?"
        queryParams.push(relatedId)
      }

      if (dueDateFrom) {
        whereClause += " AND t.due_date >= ?"
        queryParams.push(dueDateFrom)
      }

      if (dueDateTo) {
        whereClause += " AND t.due_date <= ?"
        queryParams.push(dueDateTo)
      }

      const tasksSql = `
        SELECT 
          t.*,
          u.name AS assigned_user_name,
          CASE 
            WHEN t.related_type = 'customer' THEN c.name
            WHEN t.related_type = 'lead' THEN l.name
            WHEN t.related_type = 'deal' THEN d.title
          END AS related_name,
          CASE 
            WHEN t.related_type = 'customer' THEN c.company
            WHEN t.related_type = 'lead' THEN l.company
            WHEN t.related_type = 'deal' THEN cu.name
          END AS related_company
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN customers c ON t.related_type = 'customer' AND t.related_id = c.id
        LEFT JOIN leads l ON t.related_type = 'lead' AND t.related_id = l.id
        LEFT JOIN deals d ON t.related_type = 'deal' AND t.related_id = d.id
        LEFT JOIN customers cu ON t.related_type = 'deal' AND d.customer_id = cu.id
        ${whereClause}
        ORDER BY 
          CASE t.status 
            WHEN 'pending' THEN 1
            WHEN 'in-progress' THEN 2
            WHEN 'completed' THEN 3
            WHEN 'cancelled' THEN 4
          END,
          t.due_date ASC
        LIMIT ? OFFSET ?
      `

      const tasksParams = [...queryParams, String(limit), String(offset)]

      const [tasks] = await pool.execute(tasksSql, tasksParams)

      const countSql = `
        SELECT COUNT(*) AS total 
        FROM tasks t 
        ${whereClause}
      `
      const [countResult] = await pool.execute(countSql, queryParams)

      const total = countResult[0]?.total || 0
      const totalPages = total > 0 ? Math.ceil(total / limit) : 1

      res.json({
        tasks,
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
      console.error("Tasks fetch error:", error)
      res.status(500).json({ error: "Failed to fetch tasks" })
    }
  },
)

// Get task by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const [tasks] = await pool.execute(
      `
      SELECT 
        t.*,
        u.name AS assigned_user_name,
        CASE 
          WHEN t.related_type = 'customer' THEN c.name
          WHEN t.related_type = 'lead' THEN l.name
          WHEN t.related_type = 'deal' THEN d.title
        END AS related_name,
        CASE 
          WHEN t.related_type = 'customer' THEN c.company
          WHEN t.related_type = 'lead' THEN l.company
          WHEN t.related_type = 'deal' THEN cu.name
        END AS related_company
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      LEFT JOIN customers c ON t.related_type = 'customer' AND t.related_id = c.id
      LEFT JOIN leads l ON t.related_type = 'lead' AND t.related_id = l.id
      LEFT JOIN deals d ON t.related_type = 'deal' AND t.related_id = d.id
      LEFT JOIN customers cu ON t.related_type = 'deal' AND d.customer_id = cu.id
      WHERE t.id = ?
    `,
      [id],
    )

    if (tasks.length === 0) {
      return res.status(404).json({ error: "Task not found" })
    }

    res.json({ task: tasks[0] })
  } catch (error) {
    console.error("Task fetch error:", error)
    res.status(500).json({ error: "Failed to fetch task" })
  }
})

// Create new task
router.post(
  "/",
  authenticateToken,
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("description").optional().isString().withMessage("Description must be a string"),
    body("type")
      .optional()
      .isIn(["call", "email", "meeting", "follow-up", "demo", "other"])
      .withMessage("Invalid type"),
    body("priority").optional().isIn(["low", "medium", "high"]).withMessage("Invalid priority"),
    body("status")
      .optional()
      .isIn(["pending", "in-progress", "completed", "cancelled"])
      .withMessage("Invalid status"),
    body("assignedTo").optional().isString().withMessage("AssignedTo must be a string"),
    body("relatedTo").optional().isObject().withMessage("RelatedTo must be an object"),
    body("relatedTo.type")
      .optional()
      .isIn(["customer", "lead", "deal"])
      .withMessage("Invalid related type"),
    body("relatedTo.id").optional().isString().withMessage("Related ID must be a string"),
    body("dueDate").optional().isISO8601().withMessage("Due date must be a valid date"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const {
        title,
        description,
        type = "other",
        priority = "medium",
        status = "pending",
        assignedTo: rawAssignedTo,
        relatedTo,
        dueDate,
      } = req.body

      // Normalize assignedTo
      let assignedTo = rawAssignedTo ?? null
      if (assignedTo === "" || assignedTo === "0" || assignedTo === 0) {
        assignedTo = null
      }
      if (assignedTo != null) {
        const [userRows] = await pool.execute(
          "SELECT id FROM users WHERE id = ?",
          [assignedTo],
        )
        if (userRows.length === 0) {
          return res.status(400).json({ error: "Invalid assigned user" })
        }
      }

      if (relatedTo && relatedTo.type && relatedTo.id) {
        const tableName =
          relatedTo.type === "customer"
            ? "customers"
            : relatedTo.type === "lead"
            ? "leads"
            : "deals"

        const [relatedEntities] = await pool.execute(
          `SELECT id FROM ${tableName} WHERE id = ?`,
          [relatedTo.id],
        )

        if (relatedEntities.length === 0) {
          return res.status(400).json({ error: `${relatedTo.type} not found` })
        }
      }

      const [result] = await pool.execute(
        `
        INSERT INTO tasks (
          title, description, type, priority, status, assigned_to,
          related_type, related_id, due_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          title,
          description,
          type,
          priority,
          status,
          assignedTo,
          relatedTo?.type || null,
          relatedTo?.id || null,
          dueDate,
        ],
      )

      const [tasks] = await pool.execute(
        `
        SELECT 
          t.*,
          u.name AS assigned_user_name,
          CASE 
            WHEN t.related_type = 'customer' THEN c.name
            WHEN t.related_type = 'lead' THEN l.name
            WHEN t.related_type = 'deal' THEN d.title
          END AS related_name
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN customers c ON t.related_type = 'customer' AND t.related_id = c.id
        LEFT JOIN leads l ON t.related_type = 'lead' AND t.related_id = l.id
        LEFT JOIN deals d ON t.related_type = 'deal' AND t.related_id = d.id
        WHERE t.id = ?
      `,
        [result.insertId],
      )

      res.status(201).json({
        message: "Task created successfully",
        task: tasks[0],
      })
    } catch (error) {
      console.error("Task creation error:", error)
      res.status(500).json({ error: "Failed to create task" })
    }
  },
)

// Update task
router.put(
  "/:id",
  authenticateToken,
  [
    body("title").optional().trim().notEmpty().withMessage("Title cannot be empty"),
    body("description").optional().isString().withMessage("Description must be a string"),
    body("type")
      .optional()
      .isIn(["call", "email", "meeting", "follow-up", "demo", "other"])
      .withMessage("Invalid type"),
    body("priority").optional().isIn(["low", "medium", "high"]).withMessage("Invalid priority"),
    body("status")
      .optional()
      .isIn(["pending", "in-progress", "completed", "cancelled"])
      .withMessage("Invalid status"),
    body("assignedTo").optional().isString().withMessage("AssignedTo must be a string"),
    body("relatedTo").optional().isObject().withMessage("RelatedTo must be an object"),
    body("relatedTo.type")
      .optional()
      .isIn(["customer", "lead", "deal"])
      .withMessage("Invalid related type"),
    body("relatedTo.id").optional().isString().withMessage("Related ID must be a string"),
    body("dueDate").optional().isISO8601().withMessage("Due date must be a valid date"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const { id } = req.params
      const updateData = { ...req.body }

      // Normalize assignedTo
      if (Object.prototype.hasOwnProperty.call(updateData, "assignedTo")) {
        let assignedTo = updateData.assignedTo ?? null
        if (assignedTo === "" || assignedTo === "0" || assignedTo === 0) {
          assignedTo = null
        }
        if (assignedTo != null) {
          const [userRows] = await pool.execute(
            "SELECT id FROM users WHERE id = ?",
            [assignedTo],
          )
          if (userRows.length === 0) {
            return res.status(400).json({ error: "Invalid assigned user" })
          }
        }
        updateData.assignedTo = assignedTo
      }

      const [existingTasks] = await pool.execute(
        "SELECT id, status FROM tasks WHERE id = ?",
        [id],
      )

      if (existingTasks.length === 0) {
        return res.status(404).json({ error: "Task not found" })
      }

      if (
        updateData.relatedTo &&
        updateData.relatedTo.type &&
        updateData.relatedTo.id
      ) {
        const tableName =
          updateData.relatedTo.type === "customer"
            ? "customers"
            : updateData.relatedTo.type === "lead"
            ? "leads"
            : "deals"

        const [relatedEntities] = await pool.execute(
          `SELECT id FROM ${tableName} WHERE id = ?`,
          [updateData.relatedTo.id],
        )

        if (relatedEntities.length === 0) {
          return res
            .status(400)
            .json({ error: `${updateData.relatedTo.type} not found` })
        }
      }

      const updateFields = []
      const updateValues = []

      Object.entries(updateData).forEach(([key, value]) => {
        if (key === "relatedTo" || value === undefined) return
        const dbField = taskFieldMap[key]
        if (!dbField) return

        updateFields.push(`${dbField} = ?`)
        updateValues.push(value)
      })

      if (updateData.relatedTo) {
        updateFields.push("related_type = ?", "related_id = ?")
        updateValues.push(
          updateData.relatedTo.type || null,
          updateData.relatedTo.id || null,
        )
      }

      const currentTask = existingTasks[0]
      if (updateData.status === "completed" && currentTask.status !== "completed") {
        updateFields.push("completed_at = CURRENT_TIMESTAMP")
      } else if (updateData.status && updateData.status !== "completed") {
        updateFields.push("completed_at = NULL")
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No fields to update" })
      }

      updateValues.push(id)

      await pool.execute(
        `UPDATE tasks SET ${updateFields.join(
          ", ",
        )}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        updateValues,
      )

      const [tasks] = await pool.execute(
        `
        SELECT 
          t.*,
          u.name AS assigned_user_name,
          CASE 
            WHEN t.related_type = 'customer' THEN c.name
            WHEN t.related_type = 'lead' THEN l.name
            WHEN t.related_type = 'deal' THEN d.title
          END AS related_name
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN customers c ON t.related_type = 'customer' AND t.related_id = c.id
        LEFT JOIN leads l ON t.related_type = 'lead' AND t.related_id = l.id
        LEFT JOIN deals d ON t.related_type = 'deal' AND t.related_id = d.id
        WHERE t.id = ?
      `,
        [id],
      )

      res.json({
        message: "Task updated successfully",
        task: tasks[0],
      })
    } catch (error) {
      console.error("Task update error:", error)
      res.status(500).json({ error: "Failed to update task" })
    }
  },
)

// Delete task
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const [existingTasks] = await pool.execute(
      "SELECT id FROM tasks WHERE id = ?",
      [id],
    )

    if (existingTasks.length === 0) {
      return res.status(404).json({ error: "Task not found" })
    }

    await pool.execute("DELETE FROM tasks WHERE id = ?", [id])

    res.json({ message: "Task deleted successfully" })
  } catch (error) {
    console.error("Task deletion error:", error)
    res.status(500).json({ error: "Failed to delete task" })
  }
})

// Get task statistics
router.get("/stats/overview", authenticateToken, async (req, res) => {
  try {
    const { assignedTo: rawAssignedTo } = req.query

    let whereClause = "WHERE 1=1"
    const queryParams = []

    if (rawAssignedTo) {
      whereClause += " AND assigned_to = ?"
      queryParams.push(rawAssignedTo)
    }

    const [stats] = await pool.execute(
      `
      SELECT 
        status,
        COUNT(*) AS count
      FROM tasks 
      ${whereClause}
      GROUP BY status
    `,
      queryParams,
    )

    const [overdueTasks] = await pool.execute(
      `
      SELECT COUNT(*) AS count
      FROM tasks 
      ${whereClause} AND due_date < NOW() AND status NOT IN ('completed', 'cancelled')
    `,
      queryParams,
    )

    const [todayTasks] = await pool.execute(
      `
      SELECT COUNT(*) AS count
      FROM tasks 
      ${whereClause} AND DATE(due_date) = CURDATE() AND status NOT IN ('completed', 'cancelled')
    `,
      queryParams,
    )

    res.json({
      statusBreakdown: stats,
      overdue: overdueTasks[0].count,
      dueToday: todayTasks[0].count,
    })
  } catch (error) {
    console.error("Task stats error:", error)
    res.status(500).json({ error: "Failed to fetch task statistics" })
  }
})

module.exports = router
