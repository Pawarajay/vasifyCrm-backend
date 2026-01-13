
const express = require("express");
const { pool } = require("../config/database");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT 
        id, 
        name, 
        email, 
        role,
        avatar,
        is_active,
        created_at,
        updated_at
       FROM users 
       WHERE is_active = 1
       ORDER BY name ASC`
    );

    return res.json({
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      })),
      total: users.length,
    });
  } catch (error) {
    console.error("Users fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

// GET current user profile
router.get("/me", authenticateToken, async (req, res) => {
  try {
    // auth middleware sets req.user = { id, name, email, role, is_active }
    const [users] = await pool.execute(
      `SELECT 
        id, 
        name, 
        email, 
        role,
        avatar,
        is_active,
        created_at,
        updated_at
       FROM users 
       WHERE id = ?`,
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error("User profile fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// GET user by ID
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await pool.execute(
      `SELECT 
        id, 
        name, 
        email, 
        role,
        avatar,
        is_active,
        created_at,
        updated_at
       FROM users 
       WHERE id = ?`,
      [id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
    });
  } catch (error) {
    console.error("User fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
});
// GET /api/users - basic list for filters


module.exports = router;
