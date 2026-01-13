-- -- Create database
-- CREATE DATABASE IF NOT EXISTS railway;
-- USE railway;

-- -- Users table
-- CREATE TABLE users (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   name VARCHAR(255) NOT NULL,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   password VARCHAR(255) NOT NULL,
--   role ENUM('admin', 'manager', 'sales', 'support') DEFAULT 'sales',
--   avatar VARCHAR(500),
--   is_active BOOLEAN DEFAULT TRUE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
-- );

-- -- Customers table
-- CREATE TABLE customers (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   name VARCHAR(255) NOT NULL,
--   email VARCHAR(255) UNIQUE NOT NULL,
--   phone VARCHAR(50),
--   company VARCHAR(255),
--   address TEXT,
--   city VARCHAR(100),
--   state VARCHAR(100),
--   zip_code VARCHAR(20),
--   country VARCHAR(100),
--   status ENUM('active', 'inactive', 'prospect') DEFAULT 'prospect',
--   source VARCHAR(100),
--   assigned_to VARCHAR(36),
--   tags JSON,
--   notes TEXT,
--   last_contact_date DATE,
--   total_value DECIMAL(10,2) DEFAULT 0,
--   whatsapp_number VARCHAR(50),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
-- );

-- -- Leads table
-- CREATE TABLE leads (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   name VARCHAR(255) NOT NULL,
--   email VARCHAR(255) NOT NULL,
--   phone VARCHAR(50),
--   company VARCHAR(255),
--   source ENUM('website', 'referral', 'social', 'advertisement', 'cold-call', 'other') DEFAULT 'website',
--   status ENUM('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost') DEFAULT 'new',
--   priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
--   assigned_to VARCHAR(36),
--   estimated_value DECIMAL(10,2) DEFAULT 0,
--   notes TEXT,
--   expected_close_date DATE,
--   whatsapp_number VARCHAR(50),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
-- );

-- -- Deals table
-- CREATE TABLE deals (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   title VARCHAR(255) NOT NULL,
--   customer_id VARCHAR(36),
--   value DECIMAL(10,2) NOT NULL,
--   stage ENUM('prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost') DEFAULT 'prospecting',
--   probability INT DEFAULT 0,
--   expected_close_date DATE,
--   actual_close_date DATE,
--   assigned_to VARCHAR(36),
--   products JSON,
--   notes TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
--   FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
-- );

-- -- Tasks table
-- CREATE TABLE tasks (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   title VARCHAR(255) NOT NULL,
--   description TEXT,
--   type ENUM('call', 'email', 'meeting', 'follow-up', 'demo', 'other') DEFAULT 'other',
--   priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
--   status ENUM('pending', 'in-progress', 'completed', 'cancelled') DEFAULT 'pending',
--   assigned_to VARCHAR(36),
--   related_type ENUM('customer', 'lead', 'deal'),
--   related_id VARCHAR(36),
--   due_date DATETIME,
--   completed_at DATETIME,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
-- );

-- -- Invoices table
-- CREATE TABLE invoices (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   customer_id VARCHAR(36) NOT NULL,
--   invoice_number VARCHAR(100) UNIQUE NOT NULL,
--   amount DECIMAL(10,2) NOT NULL,
--   tax DECIMAL(10,2) DEFAULT 0,
--   total DECIMAL(10,2) NOT NULL,
--   status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
--   due_date DATE,
--   paid_date DATE,
--   notes TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
-- );

-- -- Invoice items table
-- CREATE TABLE invoice_items (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   invoice_id VARCHAR(36) NOT NULL,
--   description VARCHAR(500) NOT NULL,
--   quantity INT NOT NULL,
--   rate DECIMAL(10,2) NOT NULL,
--   amount DECIMAL(10,2) NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
-- );

-- -- Renewal reminders table
-- CREATE TABLE renewal_reminders (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   customer_id VARCHAR(36) NOT NULL,
--   service_type ENUM('whatsapp-panel', 'website', 'hosting', 'domain', 'other') NOT NULL,
--   service_name VARCHAR(255) NOT NULL,
--   expiry_date DATE NOT NULL,
--   reminder_days JSON NOT NULL,
--   last_reminder_sent DATE,
--   status ENUM('active', 'renewed', 'expired', 'cancelled') DEFAULT 'active',
--   whatsapp_template TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
-- );

-- -- Renewals table
-- CREATE TABLE renewals (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   customer_id VARCHAR(36) NOT NULL,
--   service VARCHAR(255) NOT NULL,
--   amount DECIMAL(10,2) NOT NULL,
--   expiry_date DATE NOT NULL,
--   status ENUM('active', 'expiring', 'expired', 'renewed') DEFAULT 'active',
--   reminder_days INT DEFAULT 30,
--   notes TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
--   FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
-- );

-- -- WhatsApp campaigns table (for automation)
-- CREATE TABLE whatsapp_campaigns (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   name VARCHAR(255) NOT NULL,
--   template TEXT NOT NULL,
--   status ENUM('draft', 'active', 'paused', 'completed') DEFAULT 'draft',
--   target_audience JSON,
--   scheduled_at DATETIME,
--   sent_count INT DEFAULT 0,
--   delivered_count INT DEFAULT 0,
--   read_count INT DEFAULT 0,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
-- );

-- -- WhatsApp messages log table
-- CREATE TABLE whatsapp_messages (
--   id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
--   campaign_id VARCHAR(36),
--   customer_id VARCHAR(36),
--   phone_number VARCHAR(50) NOT NULL,
--   message TEXT NOT NULL,
--   status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
--   sent_at DATETIME,
--   delivered_at DATETIME,
--   read_at DATETIME,
--   error_message TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
--   FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
-- );

-- -- Insert default admin user
-- INSERT INTO users (name, email, password, role) VALUES 
-- ('Admin User', 'admin@vasifytech.com', 'admin123', 'admin');
-- -- ('Admin User', 'admin@vasifytech.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin');




CREATE DATABASE IF NOT EXISTS railway;
  USE railway;

-- ============================================
-- 1. USERS TABLE
-- ============================================

DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  -- Roles now aligned with backend: 'admin' | 'user'
  role ENUM('admin', 'user') DEFAULT 'user',
  avatar VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 2. CUSTOMERS TABLE
-- ============================================

DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  zip_code VARCHAR(20),
  country VARCHAR(100),
  status ENUM('active', 'inactive', 'prospect') DEFAULT 'prospect',
  source VARCHAR(100),
  assigned_to VARCHAR(36),
  tags JSON,
  notes TEXT,
  last_contact_date DATE,
  total_value DECIMAL(10,2) DEFAULT 0,
  whatsapp_number VARCHAR(50),
  service VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_email (email),
  INDEX idx_customers_assigned (assigned_to),
  INDEX idx_customers_status (status),
  CONSTRAINT fk_customers_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE customers
  ADD COLUMN default_tax_rate DECIMAL(5,2) NULL AFTER total_value,
  ADD COLUMN default_due_days INT NULL AFTER default_tax_rate,
  ADD COLUMN default_invoice_notes TEXT NULL AFTER default_due_days,
  ADD COLUMN recurring_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER service,
  ADD COLUMN recurring_interval ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly' AFTER recurring_enabled,
  ADD COLUMN recurring_amount DECIMAL(10,2) NULL AFTER recurring_interval,
  ADD COLUMN recurring_service VARCHAR(255) NULL AFTER recurring_amount,
  ADD COLUMN next_renewal_date DATE NULL AFTER recurring_service,
  ADD COLUMN default_renewal_status ENUM('active','expiring','expired','renewed') NULL AFTER next_renewal_date,
  ADD COLUMN default_renewal_reminder_days INT NULL AFTER default_renewal_status,
  ADD COLUMN default_renewal_notes TEXT NULL AFTER default_renewal_reminder_days;
  

ALTER TABLE customers
  ADD COLUMN service_type ENUM('whatsapp_api','website_dev','ai_agent') NULL AFTER service,
  ADD COLUMN one_time_price DECIMAL(10,2) NULL AFTER total_value,
  ADD COLUMN monthly_price DECIMAL(10,2) NULL AFTER one_time_price,
  ADD COLUMN manual_price DECIMAL(10,2) NULL AFTER monthly_price;
  



-- ============================================
-- 3. LEADS TABLE (WITH SERVICE)
-- ============================================

DROP TABLE IF EXISTS leads;

CREATE TABLE leads (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  company VARCHAR(255),
  source ENUM('website', 'referral', 'social', 'advertisement', 'cold-call', 'other') DEFAULT 'website',
  status ENUM('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'closed-won', 'closed-lost') DEFAULT 'new',
  priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
  assigned_to VARCHAR(36),
  estimated_value DECIMAL(10,2) DEFAULT 0,
  notes TEXT,
  expected_close_date DATE,
  whatsapp_number VARCHAR(50),
  -- Service options aligned with frontend + backend
  service ENUM(
    'whatsapp-business-api',
    'website-development',
    'ai-agent',
    'other'
  ) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leads_email (email),
  INDEX idx_leads_assigned (assigned_to),
  INDEX idx_leads_status (status),
  INDEX idx_leads_service (service),
  CONSTRAINT fk_leads_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

select * from leads;
ALTER TABLE leads
  ADD COLUMN converted_customer_id VARCHAR(36) NULL AFTER assigned_to;


SHOW CREATE TABLE leads;

-- ============================================
-- 4. DEALS TABLE
-- ============================================

DROP TABLE IF EXISTS deals;

CREATE TABLE deals (
  id VARCHAR(36) PRIMARY KEY,
  lead_id VARCHAR(36),
  title VARCHAR(255) NOT NULL,
  customer_id VARCHAR(36),
  value DECIMAL(10,2) NOT NULL,
  stage ENUM('prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost') DEFAULT 'prospecting',
  probability INT DEFAULT 0,
  expected_close_date DATE,
  actual_close_date DATE,
  assigned_to VARCHAR(36),
  products JSON,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_deals_customer (customer_id),
  INDEX idx_deals_assigned (assigned_to),
  INDEX idx_deals_stage (stage),
  CONSTRAINT fk_deals_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_deals_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_deals_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. TASKS TABLE
-- ============================================

DROP TABLE IF EXISTS tasks;

CREATE TABLE tasks (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type ENUM('call', 'email', 'meeting', 'follow-up', 'demo', 'other') DEFAULT 'other',
  priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
  status ENUM('pending', 'in-progress', 'completed', 'cancelled') DEFAULT 'pending',
  assigned_to VARCHAR(36),
  related_type ENUM('customer', 'lead', 'deal'),
  related_id VARCHAR(36),
  due_date DATETIME,
  completed_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tasks_assigned (assigned_to),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_due_date (due_date),
  CONSTRAINT fk_tasks_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. INVOICES TABLE
-- ============================================

DROP TABLE IF EXISTS invoices;

CREATE TABLE invoices (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL,
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_invoices_customer (customer_id),
  INDEX idx_invoices_status (status),
  INDEX idx_invoices_number (invoice_number),
  CONSTRAINT fk_invoices_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. INVOICE ITEMS TABLE
-- ============================================

DROP TABLE IF EXISTS invoice_items;
CREATE TABLE invoice_items (
  id VARCHAR(36) PRIMARY KEY,
  invoice_id VARCHAR(36) NOT NULL,
  description VARCHAR(500) NOT NULL,
  quantity INT NOT NULL,
  rate DECIMAL(10,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_invoice_items_invoice (invoice_id),
  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. RENEWALS TABLE
-- ============================================

DROP TABLE IF EXISTS renewals;

CREATE TABLE renewals (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL,
  service VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expiry_date DATE NOT NULL,
  status ENUM('active', 'expiring', 'expired', 'renewed') DEFAULT 'active',
  reminder_days INT DEFAULT 30,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_renewals_customer (customer_id),
  INDEX idx_renewals_status (status),
  INDEX idx_renewals_expiry (expiry_date),
  CONSTRAINT fk_renewals_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 9. RENEWAL REMINDERS TABLE
-- ============================================

DROP TABLE IF EXISTS renewal_reminders;

CREATE TABLE renewal_reminders (
  id VARCHAR(36) PRIMARY KEY,
  customer_id VARCHAR(36) NOT NULL,
  service_type ENUM('whatsapp-panel', 'website', 'hosting', 'domain', 'other') NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  expiry_date DATE NOT NULL,
  reminder_days JSON NOT NULL,
  last_reminder_sent DATE,
  status ENUM('active', 'renewed', 'expired', 'cancelled') DEFAULT 'active',
  whatsapp_template TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_renewal_reminders_customer (customer_id),
  INDEX idx_renewal_reminders_status (status),
  CONSTRAINT fk_renewal_reminders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 10. WHATSAPP CAMPAIGNS TABLE
-- ============================================

DROP TABLE IF EXISTS whatsapp_campaigns;

CREATE TABLE whatsapp_campaigns (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  template TEXT NOT NULL,
  status ENUM('draft', 'active', 'paused', 'completed') DEFAULT 'draft',
  target_audience JSON,
  scheduled_at DATETIME,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_campaigns_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 11. WHATSAPP MESSAGES TABLE
-- ============================================

DROP TABLE IF EXISTS whatsapp_messages;

CREATE TABLE whatsapp_messages (
  id VARCHAR(36) PRIMARY KEY,
  campaign_id VARCHAR(36),
  customer_id VARCHAR(36),
  phone_number VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('pending', 'sent', 'delivered', 'read', 'failed') DEFAULT 'pending',
  sent_at DATETIME,
  delivered_at DATETIME,
  read_at DATETIME,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_messages_campaign (campaign_id),
  INDEX idx_messages_customer (customer_id),
  INDEX idx_messages_status (status),
  CONSTRAINT fk_messages_campaign FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT fk_messages_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 12. PROJECTS TABLE
-- ============================================

DROP TABLE IF EXISTS projects;

CREATE TABLE projects (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  client_id VARCHAR(36),
  department VARCHAR(100),
  description TEXT,
  scope_of_work TEXT,
  category ENUM('CRM', 'Web App', 'Mobile App', 'AI', 'Other') DEFAULT 'Other',
  priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
  status ENUM('Not Started', 'In Progress', 'On Hold', 'Completed') DEFAULT 'Not Started',
  start_date DATE,
  end_date DATE,
  estimated_budget DECIMAL(12,2),
  actual_cost DECIMAL(12,2),
  progress_percentage INT DEFAULT 0,
  health_rating ENUM('Green', 'Yellow', 'Red') DEFAULT 'Green',
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_projects_client (client_id),
  INDEX idx_projects_created_by (created_by),
  INDEX idx_projects_status (status),
  CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 13. PROJECT TEAM TABLE
-- ============================================

DROP TABLE IF EXISTS project_team;

CREATE TABLE project_team (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role VARCHAR(100),
  skills_assigned TEXT,
  workload_capacity INT DEFAULT 100,
  hours_per_week INT DEFAULT 40,
  assigned_date DATE,
  UNIQUE KEY unique_project_user (project_id, user_id),
  INDEX idx_project_team_project (project_id),
  INDEX idx_project_team_user (user_id),
  CONSTRAINT fk_project_team_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_team_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 14. PROJECT TASKS TABLE
-- ============================================

DROP TABLE IF EXISTS project_tasks;

CREATE TABLE project_tasks (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to VARCHAR(36),
  priority ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
  status ENUM('Pending', 'In Progress', 'Blocked', 'Completed') DEFAULT 'Pending',
  due_date DATE,
  completed_date DATE,
  parent_task_id INT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_tasks_project (project_id),
  INDEX idx_project_tasks_assigned (assigned_to),
  CONSTRAINT fk_project_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_tasks_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_tasks_parent FOREIGN KEY (parent_task_id) REFERENCES project_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 15. PROJECT MILESTONES TABLE
-- ============================================

DROP TABLE IF EXISTS project_milestones;

CREATE TABLE project_milestones (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE,
  completion_date DATE,
  status ENUM('Pending', 'Completed') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_milestones_project (project_id),
  CONSTRAINT fk_project_milestones_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 16. PROJECT DAILY TRACKING TABLE
-- ============================================

DROP TABLE IF EXISTS project_daily_tracking;

CREATE TABLE project_daily_tracking (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  tracking_date DATE NOT NULL,
  planned_work TEXT,
  actual_work TEXT,
  issues_logged TEXT,
  tomorrow_plan TEXT,
  on_track_status ENUM('Green', 'Yellow', 'Red') DEFAULT 'Green',
  logged_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_project_date (project_id, tracking_date),
  INDEX idx_project_tracking_project (project_id),
  INDEX idx_project_tracking_logged_by (logged_by),
  CONSTRAINT fk_project_tracking_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_tracking_logged_by FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 17. PROJECT TIME LOGS TABLE
-- ============================================

DROP TABLE IF EXISTS project_time_logs;

CREATE TABLE project_time_logs (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  task_id INT UNSIGNED,
  hours_logged DECIMAL(5,2) NOT NULL,
  log_date DATE NOT NULL,
  is_billable BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_time_logs_project (project_id),
  INDEX idx_project_time_logs_user (user_id),
  CONSTRAINT fk_project_time_logs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_time_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_time_logs_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 18. PROJECT NOTES TABLE
-- ============================================

DROP TABLE IF EXISTS project_notes;

CREATE TABLE project_notes (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  note_type ENUM('General', 'Meeting', 'Comment') DEFAULT 'General',
  content TEXT NOT NULL,
  created_by VARCHAR(36),
  mentioned_users TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project_notes_project (project_id),
  INDEX idx_project_notes_created_by (created_by),
  CONSTRAINT fk_project_notes_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_notes_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 19. PROJECT FILES TABLE
-- ============================================

DROP TABLE IF EXISTS project_files;

CREATE TABLE project_files (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  task_id INT UNSIGNED,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(50),
  file_size INT,
  uploaded_by VARCHAR(36),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project_files_project (project_id),
  INDEX idx_project_files_uploaded_by (uploaded_by),
  CONSTRAINT fk_project_files_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_files_task FOREIGN KEY (task_id) REFERENCES project_tasks(id) ON DELETE SET NULL,
  CONSTRAINT fk_project_files_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO users (
  id,
  name,
  email,
  password,
  role,
  is_active,
  created_at,
  updated_at
) VALUES (
  UUID(),
  'Admin User',
  'admin@vasifytech.com',
  '$2b$10$rGfVLhxK5tZk0pZQN5YJHu7YqH5vXJ3qK5wZqN5YJHu7YqH5vXJ3q',
  'admin',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Verify the admin user was created
SELECT id, name, email, role, is_active, created_at 
FROM users 
WHERE email = 'admin@vasifytech.com';

-- USE vasify_crm;
select*from users;



SELECT l.* FROM leads l;

SELECT
  l.id,
  l.name,
  l.email,
  l.phone,
  l.company,
  l.source,
  l.status,
  l.priority,
  l.assigned_to AS assignedTo,
  l.estimated_value AS estimatedValue,
  l.notes,
  l.created_at AS createdAt,
  l.updated_at AS updatedAt,
  l.expected_close_date AS expectedCloseDate,
  l.whatsapp_number AS whatsappNumber
FROM leads l;


