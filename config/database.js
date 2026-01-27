const mysql = require("mysql2/promise")
require("dotenv").config()


const dbConfig = {
  host: process.env.DB_HOST || "13.203.39.243",
  user: process.env.DB_USER || "ajay",
  password: process.env.DB_PASSWORD || "vt_dev_db@ajay",
  database: process.env.DB_NAME || "vasifytech_dev",
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
}
const pool = mysql.createPool(dbConfig)

async function testConnection() {
  try {
    const connection = await pool.getConnection()
    console.log(" Database connected successfully")
    connection.release()
  } catch (error) {
    console.error(" Database connection failed:", error.message)
    process.exit(1)
  }
}

module.exports = { pool, testConnection }

