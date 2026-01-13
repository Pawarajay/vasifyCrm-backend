
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const { pool } = require("../config/database");
const { authenticateToken, requireRole } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();


const signToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name ?? null,
      is_active: user.is_active ?? true,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    }
  );
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


router.post(
  "/register",
  [
    body("name").trim().isLength({ min: 2 }).withMessage("Name must be at least 2 characters"),
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role")
      .optional()
      .isIn(["admin", "user"])
      .withMessage("Invalid role"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { name, email, password, role = "user" } = req.body;

      // Check if user already exists
      const [existingUsers] = await pool.execute(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: "User already exists with this email" });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user with UUID id
      const userId = uuidv4();

      await pool.execute(
        "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
        [userId, name, email, hashedPassword, role]
      );

      // Get created user
      const [users] = await pool.execute(
        "SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?",
        [userId]
      );

      const user = users[0];

      // Generate JWT token
      const token = signToken(user);

      return res.status(201).json({
        message: "User registered successfully",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.is_active,
          createdAt: user.created_at,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ error: "Failed to register user" });
    }
  }
);

/**
 * Login user
 */
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { email, password } = req.body;

      // Find user by email
      const [users] = await pool.execute(
        "SELECT id, name, email, password, role, is_active FROM users WHERE email = ?",
        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const user = users[0];

      if (!user.is_active) {
        return res.status(401).json({ error: "Account is deactivated" });
      }

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Generate JWT token
      const token = signToken(user);

      return res.json({
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.is_active,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Failed to login" });
    }
  }
);

/**
 * Get current user profile
 */
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      "SELECT id, name, email, role, avatar, is_active, created_at FROM users WHERE id = ?",
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: users[0] });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * Update user profile
 */
router.put(
  "/profile",
  authenticateToken,
  [
    body("name").optional().trim().isLength({ min: 2 }).withMessage("Name must be at least 2 characters"),
    body("email").optional().isEmail().withMessage("Please provide a valid email"),
    body("avatar").optional().isURL().withMessage("Avatar must be a valid URL"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { name, email, avatar } = req.body;
      const updateFields = [];
      const updateValues = [];

      if (name) {
        updateFields.push("name = ?");
        updateValues.push(name);
      }
      if (email) {
        // Check if email is already taken by another user
        const [existingUsers] = await pool.execute(
          "SELECT id FROM users WHERE email = ? AND id != ?",
          [email, req.user.id]
        );
        if (existingUsers.length > 0) {
          return res.status(400).json({ error: "Email already taken" });
        }
        updateFields.push("email = ?");
        updateValues.push(email);
      }
      if (avatar !== undefined) {
        updateFields.push("avatar = ?");
        updateValues.push(avatar);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      updateValues.push(req.user.id);

      await pool.execute(
        `UPDATE users SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        updateValues
      );

      // Get updated user
      const [users] = await pool.execute(
        "SELECT id, name, email, role, avatar, is_active, created_at FROM users WHERE id = ?",
        [req.user.id]
      );

      return res.json({
        message: "Profile updated successfully",
        user: users[0],
      });
    } catch (error) {
      console.error("Profile update error:", error);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  }
);

/**
 * Change password
 */
router.put(
  "/change-password",
  authenticateToken,
  [
    body("currentPassword").notEmpty().withMessage("Current password is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { currentPassword, newPassword } = req.body;

      // Get current user with password
      const [users] = await pool.execute(
        "SELECT password FROM users WHERE id = ?",
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        users[0].password
      );
      if (!isCurrentPasswordValid) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await pool.execute(
        "UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [hashedNewPassword, req.user.id]
      );

      return res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      return res.status(500).json({ error: "Failed to change password" });
    }
  }
);

/**
 * Get all users (admin only)
 */
router.get(
  "/users",
  authenticateToken,
  requireRole(["admin"]),
  async (req, res) => {
    try {
      const [users] = await pool.execute(
        "SELECT id, name, email, role, avatar, is_active, created_at FROM users ORDER BY created_at DESC"
      );

      return res.json({ users });
    } catch (error) {
      console.error("Users fetch error:", error);
      return res.status(500).json({ error: "Failed to fetch users" });
    }
  }
);

/**
 * Create user (admin only)
 */
router.post(
  "/users",
  authenticateToken,
  requireRole(["admin"]),
  [
    body("name").trim().isLength({ min: 2 }).withMessage("Name must be at least 2 characters"),
    body("email").isEmail().withMessage("Please provide a valid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role")
      .optional()
      .isIn(["admin", "user"])
      .withMessage("Invalid role"),
  ],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { name, email, password, role = "user" } = req.body;

      const [existingUsers] = await pool.execute(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );
      if (existingUsers.length > 0) {
        return res.status(400).json({ error: "User already exists with this email" });
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const userId = uuidv4();

      await pool.execute(
        "INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)",
        [userId, name, email, hashedPassword, role]
      );

      const [users] = await pool.execute(
        "SELECT id, name, email, role, avatar, is_active, created_at FROM users WHERE id = ?",
        [userId]
      );

      return res.status(201).json({
        message: "User created successfully",
        user: users[0],
      });
    } catch (error) {
      console.error("Admin create user error:", error);
      return res.status(500).json({ error: "Failed to create user" });
    }
  }
);

/**
 * Update user status (admin only)
 */
router.put(
  "/users/:id/status",
  authenticateToken,
  requireRole(["admin"]),
  [body("isActive").isBoolean().withMessage("isActive must be a boolean")],
  async (req, res) => {
    try {
      if (handleValidation(req, res)) return;

      const { id } = req.params;
      const { isActive } = req.body;

      // Prevent admin from deactivating themselves
      if (id === req.user.id && !isActive) {
        return res.status(400).json({ error: "Cannot deactivate your own account" });
      }

      await pool.execute(
        "UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [isActive, id]
      );

      return res.json({ message: "User status updated successfully" });
    } catch (error) {
      console.error("User status update error:", error);
      return res.status(500).json({ error: "Failed to update user status" });
    }
  }
);

/**
 * Verify token
 * Good for frontend to check if stored token is still valid.
 */
router.get("/verify", authenticateToken, (req, res) => {
  return res.json({
    valid: true,
    user: {
      id: req.user.id,
      name: req.user.name ?? null,
      email: req.user.email,
      role: req.user.role,
      isActive: req.user.is_active ?? true,
    },
  });
});

module.exports = router;
