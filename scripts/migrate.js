// const fs = require("fs")
// const path = require("path")
// const { pool } = require("../config/database")

// async function runMigration() {
//   try {
//     console.log("🚀 Starting database migration...")

//     // Read SQL schema file
//     const schemaPath = path.join(__dirname, "../database/schema.sql")
//     const schema = fs.readFileSync(schemaPath, "utf8")

//     // Split by semicolon and filter out empty statements
//     const statements = schema.split(";").filter((stmt) => stmt.trim().length > 0)

//     // Execute each statement
//     for (const statement of statements) {
//       if (statement.trim()) {
//         await pool.execute(statement)
//       }
//     }

//     console.log("✅ Database migration completed successfully!")
//     process.exit(0)
//   } catch (error) {
//     console.error("❌ Migration failed:", error.message)
//     process.exit(1)
//   }
// }

// runMigration()



//testing
const fs = require("fs")
const path = require("path")
const { pool } = require("../config/database")

async function runMigration() {
  try {
    console.log("🚀 Starting database migration...")

    const schemaPath = path.join(__dirname, "../database/schema.sql")
    const schema = fs.readFileSync(schemaPath, "utf8")

    // Simple guard: skip empty and comment-only lines, still naive for complex SQL
    const statements = schema
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--") && !stmt.startsWith("/*"))

    for (const statement of statements) {
      await pool.execute(statement)
    }

    console.log("✅ Database migration completed successfully!")
    process.exit(0)
  } catch (error) {
    console.error("❌ Migration failed:", error)
    process.exit(1)
  }
}

runMigration()
