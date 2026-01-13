
const express = require("express")
const { query, validationResult } = require("express-validator")
const { pool } = require("../config/database")
const { authenticateToken } = require("../middleware/auth")

const router = express.Router()

// Helper for validation
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

// Dashboard overview stats
router.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const [customerCount] = await pool.execute(
      'SELECT COUNT(*) AS count FROM customers WHERE status = "active"',
    )
    const [leadCount] = await pool.execute(
      'SELECT COUNT(*) AS count FROM leads WHERE status NOT IN ("closed-won", "closed-lost")',
    )
    const [dealCount] = await pool.execute(
      'SELECT COUNT(*) AS count FROM deals WHERE stage NOT IN ("closed-won", "closed-lost")',
    )
    const [taskCount] = await pool.execute(
      'SELECT COUNT(*) AS count FROM tasks WHERE status NOT IN ("completed", "cancelled")',
    )

    const [revenueStats] = await pool.execute(`
      SELECT 
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) AS paid_revenue,
        SUM(CASE WHEN status IN ('sent', 'overdue') THEN total ELSE 0 END) AS pending_revenue,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS overdue_invoices
      FROM invoices
    `)

    const [recentActivities] = await pool.execute(`
      SELECT 'customer' AS type, name AS title, created_at FROM customers 
      UNION ALL
      SELECT 'lead' AS type, name AS title, created_at FROM leads
      UNION ALL
      SELECT 'deal' AS type, title, created_at FROM deals
      UNION ALL
      SELECT 'task' AS type, title, created_at FROM tasks
      ORDER BY created_at DESC
      LIMIT 10
    `)

    const [pipelineValue] = await pool.execute(`
      SELECT SUM(value) AS total_value 
      FROM deals 
      WHERE stage NOT IN ('closed-won', 'closed-lost')
    `)

    const [renewalAlerts] = await pool.execute(`
      SELECT COUNT(*) AS count 
      FROM renewals 
      WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      AND status IN ('active', 'expiring')
    `)

    res.json({
      counts: {
        customers: customerCount[0].count,
        leads: leadCount[0].count,
        deals: dealCount[0].count,
        tasks: taskCount[0].count,
      },
      revenue: {
        paid: revenueStats[0].paid_revenue || 0,
        pending: revenueStats[0].pending_revenue || 0,
        overdueInvoices: revenueStats[0].overdue_invoices || 0,
      },
      pipeline: {
        totalValue: pipelineValue[0].total_value || 0,
      },
      alerts: {
        renewalsExpiring: renewalAlerts[0].count || 0,
      },
      recentActivities,
    })
  } catch (error) {
    console.error("Dashboard stats error:", error)
    res.status(500).json({ error: "Failed to fetch dashboard statistics" })
  }
})

// Sales performance report
router.get(
  "/sales-performance",
  authenticateToken,
  [
    query("period").optional().isIn(["week", "month", "quarter", "year"]).withMessage("Invalid period"),
    query("userId").optional().isString().withMessage("User ID must be a string"),
  ],
  async (req, res) => {
    try {
      const validationError = handleValidation(req, res)
      if (validationError) return

      const { period = "month", userId } = req.query

      let dateFilter = ""
      switch (period) {
        case "week":
          dateFilter = "DATE_SUB(NOW(), INTERVAL 1 WEEK)"
          break
        case "month":
          dateFilter = "DATE_SUB(NOW(), INTERVAL 1 MONTH)"
          break
        case "quarter":
          dateFilter = "DATE_SUB(NOW(), INTERVAL 3 MONTH)"
          break
        case "year":
          dateFilter = "DATE_SUB(NOW(), INTERVAL 1 YEAR)"
          break
      }

      let userFilter = ""
      const queryParams = []
      if (userId) {
        userFilter = "AND assigned_to = ?"
        queryParams.push(userId)
      }

      const [dealStats] = await pool.execute(
        `
        SELECT 
          stage,
          COUNT(*) AS count,
          SUM(value) AS total_value
        FROM deals 
        WHERE created_at >= ${dateFilter} ${userFilter}
        AND stage IN ('closed-won', 'closed-lost')
        GROUP BY stage
      `,
        queryParams,
      )

      const [leadStats] = await pool.execute(
        `
        SELECT 
          status,
          COUNT(*) AS count
        FROM leads 
        WHERE created_at >= ${dateFilter} ${userFilter}
        GROUP BY status
      `,
        queryParams,
      )

      const [monthlyTrend] = await pool.execute(
        `
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') AS month,
          COUNT(*) AS deals_count,
          SUM(value) AS total_value
        FROM deals 
        WHERE created_at >= ${dateFilter} ${userFilter}
        AND stage = 'closed-won'
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month
      `,
        queryParams,
      )

      res.json({
        dealPerformance: dealStats,
        leadConversion: leadStats,
        monthlyTrend,
      })
    } catch (error) {
      console.error("Sales performance report error:", error)
      res.status(500).json({ error: "Failed to generate sales performance report" })
    }
  },
)

// Customer analytics
router.get("/customer-analytics", authenticateToken, async (req, res) => {
  try {
    const [statusBreakdown] = await pool.execute(`
      SELECT status, COUNT(*) AS count 
      FROM customers 
      GROUP BY status
    `)

    const [sourceBreakdown] = await pool.execute(`
      SELECT source, COUNT(*) AS count 
      FROM customers 
      GROUP BY source
    `)

    const [topCustomers] = await pool.execute(`
      SELECT name, company, total_value 
      FROM customers 
      ORDER BY total_value DESC 
      LIMIT 10
    `)

    const [acquisitionTrend] = await pool.execute(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS month,
        COUNT(*) AS count
      FROM customers 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month
    `)

    res.json({
      statusBreakdown,
      sourceBreakdown,
      topCustomers,
      acquisitionTrend,
    })
  } catch (error) {
    console.error("Customer analytics error:", error)
    res.status(500).json({ error: "Failed to generate customer analytics" })
  }
})

module.exports = router
