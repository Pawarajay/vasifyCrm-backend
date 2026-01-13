const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

const PDFDocument = require('pdfkit');
router.get('/', async (req, res) => {
  try {
    const { status, priority, category, client_id } = req.query;
    let query = `
      SELECT p.*, 
             c.name AS client_name,
             u.name AS created_by_name,
             (SELECT COUNT(*) FROM project_team WHERE project_id = p.id) AS team_count,
             (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) AS total_tasks,
             (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'Completed') AS completed_tasks
      FROM projects p
      LEFT JOIN customers c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    if (priority) {
      query += ' AND p.priority = ?';
      params.push(priority);
    }
    if (category) {
      query += ' AND p.category = ?';
      params.push(category);
    }
    if (client_id) {
      query += ' AND p.client_id = ?';
      params.push(client_id);
    }

    query += ' ORDER BY p.created_at DESC';

    const [projects] = await pool.query(query, params);
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch projects', details: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [projects] = await pool.query(
      `
      SELECT 
        p.*,
        c.name AS client_name,
        c.email AS client_email,
        u.name AS created_by_name
      FROM projects p
      LEFT JOIN customers c ON p.client_id = c.id
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
      `,
      [req.params.id]
    );

    if (projects.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projects[0];

    const [team] = await pool.query(
      `
      SELECT pt.*, u.name, u.email
      FROM project_team pt
      JOIN users u ON pt.user_id = u.id
      WHERE pt.project_id = ?
      `,
      [req.params.id]
    );

    const [tasksSummary] = await pool.query(
      `
      SELECT 
        status,
        COUNT(*) AS count
      FROM project_tasks
      WHERE project_id = ?
      GROUP BY status
      `,
      [req.params.id]
    );

    const [milestones] = await pool.query(
      `
      SELECT *
      FROM project_milestones
      WHERE project_id = ?
      ORDER BY target_date
      `,
      [req.params.id]
    );

    project.team = team;
    project.tasksSummary = tasksSummary;
    project.milestones = milestones;

    res.json(project);
  } catch (error) {
    console.error('Error fetching project details:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch project details', details: error.message });
  }
});


router.post('/', async (req, res) => {
  try {
    const {
      title,
      client_id, 
      department,
      description,
      scope_of_work,
      category, 
      priority,
      status, 
      start_date, 
      end_date, 
      estimated_budget,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const project_id = 'PRJ-' + Date.now();

    const [result] = await pool.query(
      `
      INSERT INTO projects 
        (project_id, title, client_id, department, description, scope_of_work,
         category, priority, status, start_date, end_date, estimated_budget, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        project_id,
        title,
        client_id || null,
        department || null,
        description || null,
        scope_of_work || null,
        category || 'Other',
        priority || 'Medium',
        status || 'Not Started',
        start_date || null,
        end_date || null,
        estimated_budget || null,
        null, 
        ]
    );

    res.status(201).json({
      message: 'Project created successfully',
      projectId: result.insertId,
      project_id,
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res
      .status(500)
      .json({ error: 'Failed to create project', details: error.message });
  }
});


router.put('/:id', async (req, res) => {
  try {
    const {
      title,
      client_id,
      department,
      description,
      scope_of_work,
      category,
      priority,
      status,
      start_date,
      end_date,
      estimated_budget,
      actual_cost,
      progress_percentage,
      health_rating,
    } = req.body;

    await pool.query(
      `
      UPDATE projects SET
        title = ?, client_id = ?, department = ?, description = ?,
        scope_of_work = ?, category = ?, priority = ?, status = ?,
        start_date = ?, end_date = ?, estimated_budget = ?,
        actual_cost = ?, progress_percentage = ?, health_rating = ?
      WHERE id = ?
      `,
      [
        title,
        client_id || null,
        department || null,
        description || null,
        scope_of_work || null,
        category || 'Other',
        priority || 'Medium',
        status || 'Not Started',
        start_date || null,
        end_date || null,
        estimated_budget || null,
        actual_cost || null,
        progress_percentage || 0,
        health_rating || 'Green',
        req.params.id,
      ]
    );

    res.json({ message: 'Project updated successfully' });
  } catch (error) {
    console.error('Error updating project:', error);
    res
      .status(500)
      .json({ error: 'Failed to update project', details: error.message });
  }
});


router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res
      .status(500)
      .json({ error: 'Failed to delete project', details: error.message });
  }
});


router.post('/:id/team', async (req, res) => {
  try {
    const { user_id, role, skills_assigned, workload_capacity, hours_per_week } =
      req.body;

    const [result] = await pool.query(
      `
      INSERT INTO project_team 
        (project_id, user_id, role, skills_assigned, workload_capacity, hours_per_week, assigned_date)
      VALUES (?, ?, ?, ?, ?, ?, CURDATE())
      `,
      [
        req.params.id,
        user_id,
        role || null,
        skills_assigned || null,
        workload_capacity || 100,
        hours_per_week || 40,
      ]
    );

    res
      .status(201)
      .json({ message: 'Team member added successfully', id: result.insertId });
  } catch (error) {
    console.error('Error adding team member:', error);
    res
      .status(500)
      .json({ error: 'Failed to add team member', details: error.message });
  }
});

router.delete('/:id/team/:userId', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM project_team WHERE project_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Team member removed successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res
      .status(500)
      .json({ error: 'Failed to remove team member', details: error.message });
  }
});

// ===================== TASKS & MILESTONES =====================

router.get('/:id/tasks', async (req, res) => {
  try {
    const [tasks] = await pool.query(
      `
      SELECT t.*, u.name AS assigned_to_name
      FROM project_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.project_id = ?
      ORDER BY t.due_date, t.priority DESC
      `,
      [req.params.id]
    );

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch tasks', details: error.message });
  }
});

router.post('/:id/tasks', async (req, res) => {
  try {
    const {
      title,
      description,
      assigned_to,
      priority,
      status,
      due_date,
      parent_task_id,
    } = req.body;

    const [result] = await pool.query(
      `
      INSERT INTO project_tasks 
        (project_id, title, description, assigned_to, priority, status, due_date, parent_task_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.params.id,
        title,
        description || null,
        assigned_to || null,
        priority || 'Medium',
        status || 'Pending',
        due_date || null,
        parent_task_id || null,
      ]
    );

    res.status(201).json({
      message: 'Task created successfully',
      taskId: result.insertId,
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res
      .status(500)
      .json({ error: 'Failed to create task', details: error.message });
  }
});

router.put('/:id/tasks/:taskId', async (req, res) => {
  try {
    const { title, description, assigned_to, priority, status, due_date } =
      req.body;

    const updateFields = [];
    const values = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      values.push(description);
    }
    if (assigned_to !== undefined) {
      updateFields.push('assigned_to = ?');
      values.push(assigned_to);
    }
    if (priority !== undefined) {
      updateFields.push('priority = ?');
      values.push(priority);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      values.push(status);
      if (status === 'Completed') {
        updateFields.push('completed_date = CURDATE()');
      }
    }
    if (due_date !== undefined) {
      updateFields.push('due_date = ?');
      values.push(due_date);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.taskId);

    await pool.query(
      `
      UPDATE project_tasks SET ${updateFields.join(', ')}
      WHERE id = ?
      `,
      values
    );

    res.json({ message: 'Task updated successfully' });
  } catch (error) {
    console.error('Error updating task:', error);
    res
      .status(500)
      .json({ error: 'Failed to update task', details: error.message });
  }
});

router.delete('/:id/tasks/:taskId', async (req, res) => {
  try {
    await pool.query('DELETE FROM project_tasks WHERE id = ?', [
      req.params.taskId,
    ]);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res
      .status(500)
      .json({ error: 'Failed to delete task', details: error.message });
  }
});

router.post('/:id/milestones', async (req, res) => {
  try {
    const { title, description, target_date } = req.body;

    const [result] = await pool.query(
      `
      INSERT INTO project_milestones (project_id, title, description, target_date)
      VALUES (?, ?, ?, ?)
      `,
      [req.params.id, title, description || null, target_date || null]
    );

    res
      .status(201)
      .json({ message: 'Milestone created successfully', id: result.insertId });
  } catch (error) {
    console.error('Error creating milestone:', error);
    res
      .status(500)
      .json({ error: 'Failed to create milestone', details: error.message });
  }
});

router.put('/:id/milestones/:milestoneId', async (req, res) => {
  try {
    const { title, description, target_date, completion_date, status } =
      req.body;

    await pool.query(
      `
      UPDATE project_milestones SET
        title = ?, description = ?, target_date = ?, 
        completion_date = ?, status = ?
      WHERE id = ?
      `,
      [
        title,
        description || null,
        target_date || null,
        completion_date || null,
        status || 'Pending',
        req.params.milestoneId,
      ]
    );

    res.json({ message: 'Milestone updated successfully' });
  } catch (error) {
    console.error('Error updating milestone:', error);
    res
      .status(500)
      .json({ error: 'Failed to update milestone', details: error.message });
  }
});

// ===================== DAILY TRACKING =====================

router.get('/:id/daily-tracking', async (req, res) => {
  try {
    const [entries] = await pool.query(
      `
      SELECT dt.*, u.name AS logged_by_name
      FROM project_daily_tracking dt
      LEFT JOIN users u ON dt.logged_by = u.id
      WHERE dt.project_id = ?
      ORDER BY dt.tracking_date DESC
      LIMIT 365
      `,
      [req.params.id]
    );

    res.json(entries);
  } catch (error) {
    console.error('Error fetching daily tracking:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch daily tracking', details: error.message });
  }
});

router.post('/:id/daily-tracking', async (req, res) => {
  try {
    const {
      tracking_date,
      planned_work,
      actual_work,
      issues_logged,
      tomorrow_plan,
      on_track_status,
    } = req.body;

    await pool.query(
      `
      INSERT INTO project_daily_tracking 
        (project_id, tracking_date, planned_work, actual_work, issues_logged, tomorrow_plan, on_track_status, logged_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        planned_work = VALUES(planned_work),
        actual_work = VALUES(actual_work),
        issues_logged = VALUES(issues_logged),
        tomorrow_plan = VALUES(tomorrow_plan),
        on_track_status = VALUES(on_track_status)
      `,
      [
        req.params.id,
        tracking_date || new Date().toISOString().split('T')[0],
        planned_work || null,
        actual_work || null,
        issues_logged || null,
        tomorrow_plan || null,
        on_track_status || 'Green',
        null,
      ]
    );

    res.json({ message: 'Daily tracking saved successfully' });
  } catch (error) {
    console.error('Error saving daily tracking:', error);
    res
      .status(500)
      .json({ error: 'Failed to save daily tracking', details: error.message });
  }
});



router.get('/:id/time-logs', async (req, res) => {
  try {
    const [logs] = await pool.query(
      `
      SELECT tl.*, u.name AS user_name, t.title AS task_title
      FROM project_time_logs tl
      JOIN users u ON tl.user_id = u.id
      LEFT JOIN project_tasks t ON tl.task_id = t.id
      WHERE tl.project_id = ?
      ORDER BY tl.log_date DESC, tl.created_at DESC
      `,
      [req.params.id]
    );

    res.json(logs);
  } catch (error) {
    console.error('Error fetching time logs:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch time logs', details: error.message });
  }
});

router.post('/:id/time-logs', async (req, res) => {
  try {
    const { task_id, hours_logged, log_date, is_billable, description } =
      req.body;

    const [result] = await pool.query(
      `
      INSERT INTO project_time_logs 
        (project_id, user_id, task_id, hours_logged, log_date, is_billable, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.params.id,
        null,
        task_id || null,
        hours_logged,
        log_date || new Date().toISOString().split('T')[0],
        is_billable !== false,
        description || null,
      ]
    );

    res
      .status(201)
      .json({ message: 'Time log added successfully', id: result.insertId });
  } catch (error) {
    console.error('Error adding time log:', error);
    res
      .status(500)
      .json({ error: 'Failed to add time log', details: error.message });
  }
});

// ===================== NOTES & DISCUSSIONS =====================

router.get('/:id/notes', async (req, res) => {
  try {
    const [notes] = await pool.query(
      `
      SELECT n.*, u.name AS created_by_name
      FROM project_notes n
      LEFT JOIN users u ON n.created_by = u.id
      WHERE n.project_id = ?
      ORDER BY n.created_at DESC
      `,
      [req.params.id]
    );

    res.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch notes', details: error.message });
  }
});

router.post('/:id/notes', async (req, res) => {
  try {
    const { note_type, content, mentioned_users } = req.body;

    const [result] = await pool.query(
      `
      INSERT INTO project_notes 
        (project_id, note_type, content, created_by, mentioned_users)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        req.params.id,
        note_type || 'General',
        content,
        null,
        mentioned_users ? JSON.stringify(mentioned_users) : null,
      ]
    );

    res
      .status(201)
      .json({ message: 'Note added successfully', id: result.insertId });
  } catch (error) {
    console.error('Error adding note:', error);
    res
      .status(500)
      .json({ error: 'Failed to add note', details: error.message });
  }
});

// ===================== ANALYTICS & REPORTS =====================

router.get('/:id/analytics', async (req, res) => {
  try {
    const [taskStats] = await pool.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status = 'Blocked' THEN 1 ELSE 0 END) AS blocked,
        SUM(CASE WHEN due_date < CURDATE() AND status != 'Completed' THEN 1 ELSE 0 END) AS overdue
      FROM project_tasks
      WHERE project_id = ?
      `,
      [req.params.id]
    );

    const [timeStats] = await pool.query(
      `
      SELECT 
        SUM(hours_logged) AS total_hours,
        SUM(CASE WHEN is_billable THEN hours_logged ELSE 0 END) AS billable_hours,
        COUNT(DISTINCT user_id) AS active_users
      FROM project_time_logs
      WHERE project_id = ?
      `,
      [req.params.id]
    );

    const [teamWorkload] = await pool.query(
      `
      SELECT 
        u.name,
        pt.workload_capacity,
        COALESCE(SUM(tl.hours_logged), 0) AS hours_logged
      FROM project_team pt
      JOIN users u ON pt.user_id = u.id
      LEFT JOIN project_time_logs tl 
        ON tl.user_id = pt.user_id AND tl.project_id = pt.project_id
      WHERE pt.project_id = ?
      GROUP BY u.id, u.name, pt.workload_capacity
      `,
      [req.params.id]
    );

    res.json({
      tasks: taskStats[0] || {},
      time: timeStats[0] || {},
      teamWorkload,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch analytics', details: error.message });
  }
});


router.get('/:id/report', async (req, res) => {
  try {
    const projectId = req.params.id;
    const format = req.query.format || 'pdf'; 
    const [projectRows] = await pool.execute(
      `SELECT 
        p.title, 
        p.project_id,
        p.department,
        p.description,
        p.status, 
        p.priority,
        p.category,
        p.start_date, 
        p.end_date, 
        p.progress_percentage,
        p.estimated_budget,
        p.actual_cost,
        p.health_rating,
        c.name AS client_name,
        c.email AS client_email
      FROM projects p
      LEFT JOIN customers c ON p.client_id = c.id
      WHERE p.id = ?`,
      [projectId]
    );
    
    if (!projectRows.length) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = projectRows[0];

   
    const [taskRows] = await pool.execute(
      `SELECT 
        status, 
        COUNT(*) AS count,
        SUM(CASE WHEN due_date < CURDATE() AND status != 'Completed' THEN 1 ELSE 0 END) AS overdue_count
       FROM project_tasks 
       WHERE project_id = ? 
       GROUP BY status`,
      [projectId]
    );

  
    const [teamRows] = await pool.execute(
      `SELECT u.name, pt.role 
       FROM project_team pt
       JOIN users u ON pt.user_id = u.id
       WHERE pt.project_id = ?`,
      [projectId]
    );


    const [milestoneRows] = await pool.execute(
      `SELECT title, status, target_date, completion_date
       FROM project_milestones
       WHERE project_id = ?
       ORDER BY target_date`,
      [projectId]
    );

    if (format === 'csv') {
   
      const lines = [];
      lines.push('Field,Value');
      lines.push(`Project ID,"${project.project_id}"`);
      lines.push(`Title,"${project.title}"`);
      lines.push(`Client,"${project.client_name || 'N/A'}"`);
      lines.push(`Department,"${project.department || 'N/A'}"`);
      lines.push(`Category,${project.category}`);
      lines.push(`Status,${project.status}`);
      lines.push(`Priority,${project.priority}`);
      lines.push(`Health Rating,${project.health_rating || 'N/A'}`);
      lines.push(`Progress,${project.progress_percentage || 0}%`);
      lines.push(`Start Date,${project.start_date || 'N/A'}`);
      lines.push(`End Date,${project.end_date || 'N/A'}`);
      lines.push(`Estimated Budget,${project.estimated_budget || 'N/A'}`);
      lines.push(`Actual Cost,${project.actual_cost || 'N/A'}`);
      lines.push('');
      lines.push('Task Status,Count');
      for (const row of taskRows) {
        lines.push(`${row.status},${row.count}`);
      }

      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="project-${project.project_id}-report.csv"`);
      return res.send(csv);
    }


    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
   
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="project-${project.project_id}-report.pdf"`);
    
    doc.pipe(res);

    doc.on('error', (err) => {
      console.error('PDF generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'PDF generation failed' });
      }
    });

    
    doc.fontSize(24).font('Helvetica-Bold').text('Project Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(2);

    
    doc.fontSize(16).font('Helvetica-Bold').text('Project Information');
    doc.moveDown(0.5);
    
    const info = [
      ['Project ID:', project.project_id],
      ['Title:', project.title],
      ['Client:', project.client_name || 'N/A'],
      ['Department:', project.department || 'N/A'],
      ['Category:', project.category],
      ['Status:', project.status],
      ['Priority:', project.priority],
      ['Health Rating:', project.health_rating || 'N/A'],
      ['Progress:', `${project.progress_percentage || 0}%`],
      ['Start Date:', project.start_date || 'N/A'],
      ['End Date:', project.end_date || 'N/A'],
      ['Estimated Budget:', project.estimated_budget ? `$${project.estimated_budget}` : 'N/A'],
      ['Actual Cost:', project.actual_cost ? `$${project.actual_cost}` : 'N/A']
    ];

    doc.fontSize(10).font('Helvetica');
    info.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(label, { continued: true, width: 150 });
      doc.font('Helvetica').text(` ${value}`);
    });

    if (project.description) {
      doc.moveDown();
      doc.font('Helvetica-Bold').text('Description:');
      doc.font('Helvetica').text(project.description, { width: 500 });
    }

    // Task Summary Section
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica-Bold').text('Task Summary');
    doc.moveDown(0.5);
    
    if (taskRows.length > 0) {
      const totalTasks = taskRows.reduce((sum, row) => sum + row.count, 0);
      doc.fontSize(10).font('Helvetica').text(`Total Tasks: ${totalTasks}`);
      doc.moveDown(0.3);
      
      taskRows.forEach(row => {
        const percentage = totalTasks > 0 ? ((row.count / totalTasks) * 100).toFixed(1) : 0;
        doc.font('Helvetica-Bold').text(`${row.status}:`, { continued: true });
        doc.font('Helvetica').text(` ${row.count} (${percentage}%)`);
      });
    } else {
      doc.fontSize(10).font('Helvetica').text('No tasks found');
    }

  
    if (teamRows.length > 0) {
      doc.moveDown(2);
      doc.fontSize(16).font('Helvetica-Bold').text('Team Members');
      doc.moveDown(0.5);
      
      doc.fontSize(10);
      teamRows.forEach(member => {
        doc.font('Helvetica-Bold').text(member.name, { continued: true });
        doc.font('Helvetica').text(` - ${member.role || 'Team Member'}`);
      });
    }


    if (milestoneRows.length > 0) {
      doc.moveDown(2);
      doc.fontSize(16).font('Helvetica-Bold').text('Milestones');
      doc.moveDown(0.5);
      
      doc.fontSize(10);
      milestoneRows.forEach(milestone => {
        doc.font('Helvetica-Bold').text(milestone.title);
        doc.font('Helvetica').text(`Status: ${milestone.status}`);
        doc.text(`Target Date: ${milestone.target_date || 'N/A'}`);
        if (milestone.completion_date) {
          doc.text(`Completed: ${milestone.completion_date}`);
        }
        doc.moveDown(0.5);
      });
    }


    doc.moveDown(3);
    doc.fontSize(8).font('Helvetica').text(
      '─────────────────────────────────────────────────────────────────',
      { align: 'center' }
    );
    doc.text('VasifyTech CRM - Project Management System', { align: 'center' });

   
    doc.end();
    
  } catch (err) {
    console.error('Error generating project report', err);
    
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate report', details: err.message });
    }
  }
});


module.exports = router;
