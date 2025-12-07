let express = require('express');
let router = express.Router();
let { GoogleGenerativeAI } = require('@google/generative-ai');
let Task = require('../models/Task');
let mongoose = require('mongoose');
let moment = require('moment');
const { getConnection } = require('../middleware/connection');
const https = require('https');
const http = require('http');

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks with optional search/filter and pagination
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    let { status, priority, search, dueDate, page = 1, limit = 20 } = req.query;

    let validStatuses = ['To Do', 'In Progress', 'Done'];
    let validPriorities = ['Low', 'Medium', 'High', 'Critical'];

    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority value' });
    }

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, message: 'Invalid pagination parameters' });
    }

    let matchStage = {};

    if (status) matchStage.status = status;
    if (priority) matchStage.priority = priority;
    if (search) {
      matchStage.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (dueDate) {
      matchStage.dueDate = dueDate;
    }

    let skip = (parseInt(page) - 1) * parseInt(limit);
    let connection = getConnection()

    let pipeline = [
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          tasks: [
            { $skip: skip },
            { $limit: parseInt(limit) }
          ],
          totalCount: [{ $count: 'count' }]
        }
      }
    ];

    let [result] = await connection.db(process.env.MONGODB_NAME).collection("tasks").aggregate(pipeline).toArray();
    let tasks = result.tasks;
    let total = result.totalCount[0]?.count || 0;
    let totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: tasks,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/tasks/board
 * @desc    Get tasks grouped by status for board view with per-status pagination
 * @access  Public
 */
router.get('/board', async (req, res) => {
  try {
    let { priority, search, dueDate, page = 1, limit = 5 } = req.query;

    let validPriorities = ['Low', 'Medium', 'High', 'Critical'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority value' });
    }

    let matchStage = {};
    if (priority) matchStage.priority = priority;
    if (search) {
      matchStage.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    if (dueDate) matchStage.dueDate = dueDate;

    let skip = (parseInt(page) - 1) * parseInt(limit);
    let connection = getConnection();

    // Get tasks for each status separately
    let statuses = ['To Do', 'In Progress', 'Done'];
    let allTasks = [];
    let statusCounts = {};
    let hasMorePages = false;

    for (let status of statuses) {
      let statusMatch = { ...matchStage, status };
      
      // Get count for this status
      let countPipeline = [{ $match: statusMatch }, { $count: 'count' }];
      let [countResult] = await connection.db(process.env.MONGODB_NAME).collection("tasks").aggregate(countPipeline).toArray();
      let statusCount = countResult?.count || 0;
      statusCounts[status] = statusCount;
      
      // Check if this status has more pages
      if (statusCount > parseInt(page) * parseInt(limit)) {
        hasMorePages = true;
      }
      
      // Get tasks for this status
      let pipeline = [
        { $match: statusMatch },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: parseInt(limit) }
      ];
      let tasks = await connection.db(process.env.MONGODB_NAME).collection("tasks").aggregate(pipeline).toArray();
      allTasks.push(...tasks);
    }

    let totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    let totalPages = Math.max(...Object.values(statusCounts).map(count => Math.ceil(count / parseInt(limit))));

    res.status(200).json({
      success: true,
      data: allTasks,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: totalCount,
        hasNext: hasMorePages,
        hasPrev: parseInt(page) > 1,
        statusCounts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/tasks/:id
 * @desc    Get single task by ID
 * @access  Public
 */
router.get('/view-task', async (req, res) => {
  try {
    if (!req.query.id) {
      return res.status(400).json({ success: false, message: 'Task ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.query.id)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    let task = await Task.findById(req.query.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Public
 */
router.post('/create-task', async (req, res) => {
  try {
    let { title, description, status, priority, dueDate, transcript } = req.body;

    let existingTask = await Task.findOne({ 
      title: { $regex: `^${title?.trim()}$`, $options: 'i' }, 
      description: { $regex: `^${description?.trim()}$`, $options: 'i' } 
    });
    if (existingTask) {
      return res.status(400).json({ success: false, message: 'Task with same title and description already exists' });
    }

    let validStatuses = ['To Do', 'In Progress', 'Done'];
    if (status && !validStatuses.includes(status)) {
      status = 'To Do';
    }

    let parsedDate;
    if (dueDate) {
      parsedDate = /^\d{2}-\d{2}-\d{4}$/.test(dueDate)
        ? moment(dueDate, 'DD-MM-YYYY')
        : moment(dueDate);

      if (!parsedDate.isValid()) {
        return res.status(400).json({ success: false, message: 'Invalid due date format' });
      }
      if (parsedDate.isBefore(moment(), 'day')) {
        return res.status(400).json({ success: false, message: 'Due date must be in the future' });
      }
      parsedDate = parsedDate.format('DD-MM-YYYY');
    }

    let taskData = {
      title: title?.trim(),
      description: description?.trim(),
      status: status || 'To Do',
      priority,
      dueDate: parsedDate
    };
    
    if (transcript?.trim()) {
      taskData.transcript = transcript.trim();
    } else {
      taskData.transcript = (description || title).substring(0, 1000);
    }
    
    let task = new Task(taskData);

    await task.save();
    res.status(200).json({ success: true, message: 'Task created successfully', task });
  } catch (error) {
    if (error.name === 'ValidationError') {
      let field = Object.keys(error.errors)[0];
      let msg = error.errors[field].message;
      return res.status(400).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task by ID
 * @access  Public
 */
router.put('/update-task', async (req, res) => {
  try {

    if(!req.body._id){
      return res.status(400).json({ success: false, message: 'Task ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.body._id)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    let task = await Task.findById(req.body._id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    let { title, description, dueDate } = req.body;

    if (title || description) {
      let existingTask = await Task.findOne({ 
        _id: { $ne: req.body._id },

        title: { $regex: `^${(title || task.title).trim()}$`, $options: 'i' }, 
        description: { $regex: `^${(description || task.description).trim()}$`, $options: 'i' } 
      });
      if (existingTask) {
        return res.status(400).json({ success: false, message: 'Task with same title and description already exists' });
      }
    }

    if (dueDate) {
      let parsedDate = /^\d{2}-\d{2}-\d{4}$/.test(dueDate)
        ? moment(dueDate, 'DD-MM-YYYY')
        : moment(dueDate);

      if (!parsedDate.isValid()) {
        return res.status(400).json({ success: false, message: 'Invalid due date format' });
      }
      if (parsedDate.isBefore(moment(), 'day')) {
        return res.status(400).json({ success: false, message: 'Due date must be in the future' });
      }
      req.body.dueDate = parsedDate.format('DD-MM-YYYY');
    }

    Object.assign(task, req.body);
    await task.save();

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    if (error.name === 'ValidationError') {
      let field = Object.keys(error.errors)[0];
      let msg = error.errors[field].message;
      return res.status(400).json({ success: false, message: msg });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete task by ID
 * @access  Public
 */
router.delete('/delete-task', async (req, res) => {
  try {
    if(!req.query.id){
      return res.status(400).json({ success: false, message: 'Task ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.query.id)) {
      return res.status(400).json({ success: false, message: 'Invalid task ID' });
    }

    let task = await Task.findByIdAndDelete(req.query.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({ success: true, message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/tasks/parse-voice-data
 * @desc    Parse voice transcript and return structured data
 * @access  Public
 */
router.post('/parse-voice-data', async (req, res) => {
  try {
    let { transcript } = req.body

    if (!transcript || transcript.trim() === '') {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }

    if (transcript.length > 5000) {
      return res.status(400).json({ success: false, message: 'Transcript too long' });
    }

    let title, description, priority, dueDate;
    
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Parse this task description and extract structured data. Return ONLY valid JSON with no markdown formatting.

Task: "${transcript}"

Extract:
- title: Short action verb + object (20-60 chars, Title Case) - DO NOT include priority or date. Examples: "Review Code", "Fix Login Bug", "Migrate User Data"
- description: Clean description of what needs to be done - DO NOT include priority or date
- priority: One of: Low, Medium, High, Critical (default: Medium)
- dueDate: Format DD-MM-YYYY. Parse relative dates (tomorrow, next week, etc.) based on today's date ${moment().format('DD-MM-YYYY')}. If no date mentioned, use null.

Examples:
Input: "Create a high priority task to review code by January 29,2028"
Output: {"title": "Review Code", "description": "Review code", "priority": "High", "dueDate": "29-01-2028"}

Input: "Critical priority task to migrate user data from old system to new database by January 30, 2026"
Output: {"title": "Migrate User Data", "description": "Migrate user data from old system to new database", "priority": "Critical", "dueDate": "30-01-2026"}

Return format:
{
  "title": "extracted title",
  "description": "detailed description",
  "priority": "Medium",
  "dueDate": "DD-MM-YYYY or null"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();
      
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      let parsed = JSON.parse(text);
      
      title = parsed.title || transcript.substring(0, 100);
      description = parsed.description || transcript;
      priority = ['Low', 'Medium', 'High', 'Critical'].includes(parsed.priority) ? parsed.priority : 'Medium';
      dueDate = parsed.dueDate && parsed.dueDate !== 'null' ? parsed.dueDate : null;
      
      if (dueDate) {
        let parsedDate = moment(dueDate, 'DD-MM-YYYY', true);
        if (!parsedDate.isValid() || parsedDate.isBefore(moment(), 'day')) {
          dueDate = null;
        }
      }
    } catch (aiError) {
      console.error('AI parsing failed, using fallback:', aiError.message);
      title = transcript.substring(0, 100);
      description = transcript;
      priority = transcript.toLowerCase().includes('critical') ? 'Critical' :
                 transcript.toLowerCase().includes('high') ? 'High' :
                 transcript.toLowerCase().includes('low') ? 'Low' : 'Medium';
      dueDate = null;
    }
    
    res.status(200).json({ 
      success: true, 
      data: { title, description, priority, dueDate }
    });
  } catch (error) {
    console.error('Parse Error:', error);
    res.status(500).json({ success: false, message: 'Failed to parse transcript.' });
  }
});

/**
 * @route   POST /api/tasks/parse-voice
 * @desc    Parse voice transcript and create task directly
 * @access  Public
 */
router.post('/parse-voice', async (req, res) => {
  try {
    let { transcript } = req.body

    if (!transcript || transcript.trim() === '') {
      return res.status(400).json({ success: false, message: 'Transcript is required' });
    }

    if (transcript.length > 5000) {
      return res.status(400).json({ success: false, message: 'Transcript too long' });
    }

    let title, description, priority, dueDate;
    
    try {
      // Use Gemini API for intelligent parsing
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Parse this task description and extract structured data. Return ONLY valid JSON with no markdown formatting.

Task: "${transcript}"

Extract:
- title: Short action verb + object (20-60 chars, Title Case) - DO NOT include priority or date. Examples: "Review Code", "Fix Login Bug", "Migrate User Data"
- description: Clean description of what needs to be done - DO NOT include priority or date
- priority: One of: Low, Medium, High, Critical (default: Medium)
- dueDate: Format DD-MM-YYYY. Parse relative dates (tomorrow, next week, etc.) based on today's date ${moment().format('DD-MM-YYYY')}. If no date mentioned, use null.

Examples:
Input: "Create a high priority task to review code by January 29,2028"
Output: {"title": "Review Code", "description": "Review code", "priority": "High", "dueDate": "29-01-2028"}

Input: "Critical priority task to migrate user data from old system to new database by January 30, 2026"
Output: {"title": "Migrate User Data", "description": "Migrate user data from old system to new database", "priority": "Critical", "dueDate": "30-01-2026"}

Return format:
{
  "title": "extracted title",
  "description": "detailed description",
  "priority": "Medium",
  "dueDate": "DD-MM-YYYY or null"
}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();
      
      // Remove markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      let parsed = JSON.parse(text);
      
      // Validate and set defaults
      title = parsed.title || transcript.substring(0, 50);
      description = parsed.description || transcript;
      priority = ['Low', 'Medium', 'High', 'Critical'].includes(parsed.priority) ? parsed.priority : 'Medium';
      dueDate = parsed.dueDate && parsed.dueDate !== 'null' ? parsed.dueDate : null;
      
      // Validate date format
      if (dueDate) {
        let parsedDate = moment(dueDate, 'DD-MM-YYYY', true);
        if (!parsedDate.isValid() || parsedDate.isBefore(moment(), 'day')) {
          dueDate = null;
        }
      }
    } catch (aiError) {
      console.error('AI parsing failed, using fallback:', aiError.message);
      // Fallback: Basic parsing
      title = transcript.substring(0, 100);
      description = transcript;
      priority = transcript.toLowerCase().includes('critical') ? 'Critical' :
                 transcript.toLowerCase().includes('high') ? 'High' :
                 transcript.toLowerCase().includes('low') ? 'Low' : 'Medium';
      dueDate = null;
    }
    
    // Create task
    let task = new Task({
      title: title.trim(),
      description: description.trim(),
      status: 'To Do',
      priority,
      dueDate,
      transcript: transcript.trim()
    });

    await task.save();
    res.status(200).json({ success: true, message: 'Task created from voice input', task });
  } catch (error) {
    if (error.name === 'ValidationError') {
      let field = Object.keys(error.errors)[0];
      let msg = error.errors[field].message;
      return res.status(400).json({ success: false, message: msg });
    }
    console.error('Parse Error:', error);
    
    // Check for network errors
    if (error.cause?.code === 'ENOTFOUND' || error.message.includes('fetch failed')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Unable to reach AI service. Check network connection or API key.' 
      });
    }
    
    res.status(500).json({ success: false, message: 'Failed to create task from transcript.' });
  }
});

module.exports = router;
