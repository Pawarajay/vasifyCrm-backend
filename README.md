# VasifyTech CRM Backend

A comprehensive Node.js/Express backend for the VasifyTech CRM system with MySQL database, WhatsApp integration, and automated renewal reminders.

## Features

- **Authentication & Authorization**: JWT-based auth with role-based access control
- **Customer Management**: Full CRUD operations with advanced filtering
- **Lead Management**: Lead tracking with conversion to customers
- **Deal Pipeline**: Sales pipeline management with stages and probability tracking
- **Task Management**: Task assignment and tracking with due dates
- **Invoice System**: Invoice generation with items and payment tracking
- **Renewal Management**: Automated renewal reminders via WhatsApp
- **WhatsApp Integration**: Campaign management and message tracking
- **Real-time Scheduling**: Automated tasks for reminders and status updates
- **Comprehensive Reporting**: Dashboard analytics and performance reports

## Setup Instructions

### 1. Install Dependencies
\`\`\`bash
cd backend
npm install
\`\`\`

### 2. Database Setup
\`\`\`bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE vasifytech_crm;
exit

# Run database migration
npm run migrate
\`\`\`

### 3. Environment Configuration
\`\`\`bash
cp .env.example .env
# Edit .env with your database credentials and API keys
\`\`\`

### 4. Start the Server
\`\`\`bash
# Development
npm run dev

# Production
npm start
\`\`\`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile
- `PUT /api/auth/change-password` - Change password

### Customers
- `GET /api/customers` - List customers with filtering
- `GET /api/customers/:id` - Get customer details
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Leads
- `GET /api/leads` - List leads with filtering
- `POST /api/leads` - Create lead
- `PUT /api/leads/:id` - Update lead
- `POST /api/leads/:id/convert` - Convert lead to customer
- `DELETE /api/leads/:id` - Delete lead

### Deals
- `GET /api/deals` - List deals with filtering
- `POST /api/deals` - Create deal
- `PUT /api/deals/:id` - Update deal
- `GET /api/deals/pipeline/summary` - Pipeline summary
- `DELETE /api/deals/:id` - Delete deal

### Tasks
- `GET /api/tasks` - List tasks with filtering
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `GET /api/tasks/stats/overview` - Task statistics
- `DELETE /api/tasks/:id` - Delete task

### Invoices
- `GET /api/invoices` - List invoices with filtering
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices/:id` - Update invoice
- `GET /api/invoices/stats/overview` - Invoice statistics
- `DELETE /api/invoices/:id` - Delete invoice

### Renewals
- `GET /api/renewals` - List renewals with filtering
- `POST /api/renewals` - Create renewal
- `PUT /api/renewals/:id` - Update renewal
- `GET /api/renewals/reminders/list` - List renewal reminders
- `POST /api/renewals/reminders` - Create renewal reminder
- `GET /api/renewals/stats/overview` - Renewal statistics
- `DELETE /api/renewals/:id` - Delete renewal

### WhatsApp
- `GET /api/whatsapp/campaigns` - List WhatsApp campaigns
- `POST /api/whatsapp/campaigns` - Create campaign
- `PUT /api/whatsapp/campaigns/:id/status` - Update campaign status
- `POST /api/whatsapp/send-message` - Send WhatsApp message
- `GET /api/whatsapp/messages` - Message history
- `POST /api/whatsapp/send-renewal-reminders` - Send renewal reminders
- `GET /api/whatsapp/stats` - WhatsApp statistics

### Reports
- `GET /api/reports/dashboard` - Dashboard overview
- `GET /api/reports/sales-performance` - Sales performance report
- `GET /api/reports/customer-analytics` - Customer analytics

## Automated Features

### Renewal Reminders
- Automatically sends WhatsApp reminders based on configured reminder days
- Runs daily at 9 AM and hourly during business hours
- Tracks reminder history to avoid duplicates

### Status Updates
- Automatically updates renewal statuses (active → expiring → expired)
- Marks overdue invoices automatically
- Runs daily at midnight

## Database Schema

The system uses MySQL with the following main tables:
- `users` - User accounts and authentication
- `customers` - Customer information and contact details
- `leads` - Lead tracking and conversion
- `deals` - Sales pipeline and deal management
- `tasks` - Task assignment and tracking
- `invoices` & `invoice_items` - Invoice management
- `renewals` & `renewal_reminders` - Renewal tracking
- `whatsapp_campaigns` & `whatsapp_messages` - WhatsApp integration

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- Input validation and sanitization
- SQL injection prevention
- CORS configuration

## Environment Variables

\`\`\`env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=vasifytech_crm
DB_PORT=3306

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d

# Server
PORT=5000
NODE_ENV=development

# WhatsApp API (optional)
WHATSAPP_API_URL=https://api.whatsapp.com
WHATSAPP_API_TOKEN=your_token

# Frontend
FRONTEND_URL=http://localhost:3000
\`\`\`

## Production Deployment

1. Set `NODE_ENV=production`
2. Use a process manager like PM2
3. Set up SSL certificates
4. Configure reverse proxy (nginx)
5. Set up database backups
6. Monitor logs and performance

## Support

For technical support or questions, contact the development team.
