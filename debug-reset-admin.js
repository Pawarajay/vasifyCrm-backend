const bcrypt = require("bcryptjs");
const { pool } = require("./config/database");

(async () => {
  try {
    const plain = "Admin@123"; // new known password
    const hash = await bcrypt.hash(plain, 10);

    await pool.execute(
      "UPDATE users SET password = ? WHERE email = ?",
      [hash, "admin@vasifytech.com"]
    );

    console.log("Password reset OK");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
