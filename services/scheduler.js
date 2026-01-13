// const cron = require("node-cron")
// const { pool } = require("../config/database")

// // Function to send renewal reminders
// async function sendRenewalReminders() {
//   try {
//     console.log("[Scheduler] Running renewal reminder check...")

//     // Get active renewal reminders that need to be sent
//     const [reminders] = await pool.execute(`
//       SELECT 
//         rr.*,
//         c.name as customer_name,
//         c.whatsapp_number as customer_whatsapp
//       FROM renewal_reminders rr
//       LEFT JOIN customers c ON rr.customer_id = c.id
//       WHERE rr.status = 'active' 
//       AND c.whatsapp_number IS NOT NULL
//       AND c.whatsapp_number != ''
//     `)

//     let sentCount = 0

//     for (const reminder of reminders) {
//       const reminderDays = JSON.parse(reminder.reminder_days || "[]")
//       const expiryDate = new Date(reminder.expiry_date)
//       const today = new Date()
//       const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24))

//       // Check if we should send a reminder today
//       if (reminderDays.includes(daysUntilExpiry)) {
//         // Check if we haven't sent a reminder today
//         const lastReminderDate = reminder.last_reminder_sent ? new Date(reminder.last_reminder_sent) : null
//         const todayStr = today.toISOString().split("T")[0]
//         const lastReminderStr = lastReminderDate ? lastReminderDate.toISOString().split("T")[0] : null

//         if (lastReminderStr !== todayStr) {
//           // Prepare message from template
//           let message =
//             reminder.whatsapp_template ||
//             "Hi {customerName}, your {serviceName} expires on {expiryDate}. Please renew to continue service."

//           message = message
//             .replace("{customerName}", reminder.customer_name)
//             .replace("{serviceName}", reminder.service_name)
//             .replace("{expiryDate}", expiryDate.toLocaleDateString())

//           // Send WhatsApp message
//           await pool.execute(
//             `
//             INSERT INTO whatsapp_messages (customer_id, phone_number, message, status, sent_at)
//             VALUES (?, ?, ?, 'sent', NOW())
//           `,
//             [reminder.customer_id, reminder.customer_whatsapp, message],
//           )

//           // Update last reminder sent date
//           await pool.execute("UPDATE renewal_reminders SET last_reminder_sent = CURDATE() WHERE id = ?", [reminder.id])

//           sentCount++
//           console.log(`[Renewal Reminder] Sent to ${reminder.customer_name}: ${message}`)
//         }
//       }
//     }

//     console.log(`[Scheduler] Sent ${sentCount} renewal reminders`)
//   } catch (error) {
//     console.error("[Scheduler] Error sending renewal reminders:", error)
//   }
// }

// // Function to update renewal statuses
// async function updateRenewalStatuses() {
//   try {
//     console.log("[Scheduler] Updating renewal statuses...")

//     // Update expired renewals
//     await pool.execute(`
//       UPDATE renewals 
//       SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
//       WHERE expiry_date < CURDATE() AND status != 'expired'
//     `)

//     // Update expiring renewals (within 30 days)
//     await pool.execute(`
//       UPDATE renewals 
//       SET status = 'expiring', updated_at = CURRENT_TIMESTAMP 
//       WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) 
//       AND status = 'active'
//     `)

//     console.log("[Scheduler] Renewal statuses updated")
//   } catch (error) {
//     console.error("[Scheduler] Error updating renewal statuses:", error)
//   }
// }

// // Function to update invoice statuses
// async function updateInvoiceStatuses() {
//   try {
//     console.log("[Scheduler] Updating invoice statuses...")

//     // Mark overdue invoices
//     await pool.execute(`
//       UPDATE invoices 
//       SET status = 'overdue', updated_at = CURRENT_TIMESTAMP 
//       WHERE due_date < CURDATE() AND status = 'sent'
//     `)

//     console.log("[Scheduler] Invoice statuses updated")
//   } catch (error) {
//     console.error("[Scheduler] Error updating invoice statuses:", error)
//   }
// }

// // Schedule tasks
// function initializeScheduler() {
//   console.log("[Scheduler] Initializing scheduled tasks...")

//   // Run renewal reminders daily at 9 AM
//   cron.schedule("0 9 * * *", sendRenewalReminders, {
//     timezone: "UTC",
//   })

//   // Update statuses daily at midnight
//   cron.schedule(
//     "0 0 * * *",
//     async () => {
//       await updateRenewalStatuses()
//       await updateInvoiceStatuses()
//     },
//     {
//       timezone: "UTC",
//     },
//   )

//   // Run renewal reminders every hour during business hours (9 AM - 6 PM)
//   cron.schedule("0 9-18 * * *", sendRenewalReminders, {
//     timezone: "UTC",
//   })

//   console.log("[Scheduler] Scheduled tasks initialized")
// }

// module.exports = {
//   initializeScheduler,
//   sendRenewalReminders,
//   updateRenewalStatuses,
//   updateInvoiceStatuses,
// }



//testing
const cron = require("node-cron")
const { pool } = require("../config/database")

const parseJsonArray = (value) => {
  if (!value) return []
  try {
    return JSON.parse(value)
  } catch {
    return []
  }
}

// Function to send renewal reminders
async function sendRenewalReminders() {
  try {
    console.log("[Scheduler] Running renewal reminder check...")

    const [reminders] = await pool.execute(`
      SELECT 
        rr.*,
        c.name AS customer_name,
        c.whatsapp_number AS customer_whatsapp
      FROM renewal_reminders rr
      LEFT JOIN customers c ON rr.customer_id = c.id
      WHERE rr.status = 'active' 
      AND c.whatsapp_number IS NOT NULL
      AND c.whatsapp_number != ''
    `)

    let sentCount = 0
    const today = new Date()
    const todayStr = today.toISOString().split("T")[0]

    for (const reminder of reminders) {
      const reminderDays = parseJsonArray(reminder.reminder_days)
      const expiryDate = new Date(reminder.expiry_date)
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24))

      if (!reminderDays.includes(daysUntilExpiry)) continue

      const lastReminderDate = reminder.last_reminder_sent ? new Date(reminder.last_reminder_sent) : null
      const lastReminderStr = lastReminderDate ? lastReminderDate.toISOString().split("T")[0] : null

      if (lastReminderStr === todayStr) continue

      let message =
        reminder.whatsapp_template ||
        "Hi {customerName}, your {serviceName} expires on {expiryDate}. Please renew to continue service."

      message = message
        .replace("{customerName}", reminder.customer_name)
        .replace("{serviceName}", reminder.service_name)
        .replace("{expiryDate}", expiryDate.toLocaleDateString())

      await pool.execute(
        `
        INSERT INTO whatsapp_messages (customer_id, phone_number, message, status, sent_at)
        VALUES (?, ?, ?, 'sent', NOW())
      `,
        [reminder.customer_id, reminder.customer_whatsapp, message],
      )

      await pool.execute(
        "UPDATE renewal_reminders SET last_reminder_sent = CURDATE() WHERE id = ?",
        [reminder.id],
      )

      sentCount++
      console.log(`[Renewal Reminder] Sent to ${reminder.customer_name}: ${message}`)
    }

    console.log(`[Scheduler] Sent ${sentCount} renewal reminders`)
  } catch (error) {
    console.error("[Scheduler] Error sending renewal reminders:", error)
  }
}

// Function to update renewal statuses
async function updateRenewalStatuses() {
  try {
    console.log("[Scheduler] Updating renewal statuses...")

    await pool.execute(`
      UPDATE renewals 
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP 
      WHERE expiry_date < CURDATE() AND status != 'expired'
    `)

    await pool.execute(`
      UPDATE renewals 
      SET status = 'expiring', updated_at = CURRENT_TIMESTAMP 
      WHERE expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) 
      AND status = 'active'
    `)

    console.log("[Scheduler] Renewal statuses updated")
  } catch (error) {
    console.error("[Scheduler] Error updating renewal statuses:", error)
  }
}

// Function to update invoice statuses
async function updateInvoiceStatuses() {
  try {
    console.log("[Scheduler] Updating invoice statuses...")

    await pool.execute(`
      UPDATE invoices 
      SET status = 'overdue', updated_at = CURRENT_TIMESTAMP 
      WHERE due_date < CURDATE() AND status = 'sent'
    `)

    console.log("[Scheduler] Invoice statuses updated")
  } catch (error) {
    console.error("[Scheduler] Error updating invoice statuses:", error)
  }
}

// Schedule tasks
function initializeScheduler() {
  console.log("[Scheduler] Initializing scheduled tasks...")

  // Run renewal reminders every hour during business hours (9 AM - 6 PM UTC)
  cron.schedule(
    "0 9-18 * * *",
    () => {
      void sendRenewalReminders()
    },
    {
      timezone: "UTC",
    },
  )

  // Update statuses daily at midnight UTC
  cron.schedule(
    "0 0 * * *",
    async () => {
      await updateRenewalStatuses()
      await updateInvoiceStatuses()
    },
    {
      timezone: "UTC",
    },
  )

  console.log("[Scheduler] Scheduled tasks initialized")
}

module.exports = {
  initializeScheduler,
  sendRenewalReminders,
  updateRenewalStatuses,
  updateInvoiceStatuses,
}
