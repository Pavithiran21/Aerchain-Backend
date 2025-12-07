# Aerchain Backend

Node.js + Express REST API with AI-powered task parsing using Google Gemini.

## Features

- 🤖 **AI Task Parsing**: Convert voice transcripts to structured tasks using Gemini 2.5 Flash
- 📊 **Pagination**: Per-status pagination for board view (5 items per status)
- 🔍 **Advanced Filtering**: Search, filter by status, priority, and due date
- ✅ **Validation**: Comprehensive input validation and error handling
- 📅 **Date Parsing**: Smart date parsing with Moment.js
- 🔒 **Duplicate Prevention**: Prevents duplicate tasks

## Tech Stack

- Node.js + Express
- MongoDB (Native Driver)
- Google Gemini AI (2.5 Flash)
- Moment.js
- CORS enabled

## Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment:**
   Create `.env` file:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   MONGODB_NAME=your_database_name
   GEMINI_API_KEY=your_gemini_api_key
   PORT=3000
   ```

3. **Start Server:**
   ```bash
   npm start
   ```
   Server runs at `http://localhost:3000`

## API Endpoints

### Tasks

#### GET `/api/tasks`
Get all tasks with pagination and filters.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20, max: 100)
- `status` (To Do | In Progress | Done)
- `priority` (Low | Medium | High | Critical)
- `search` (search in title/description)
- `dueDate` (DD-MM-YYYY)

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 25,
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### GET `/api/tasks/board`
Get tasks grouped by status for board view with per-status pagination.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 5)
- `priority`, `search`, `dueDate`

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "statusCounts": {
      "To Do": 10,
      "In Progress": 5,
      "Done": 8
    },
    "hasNext": true,
    "hasPrev": false
  }
}
```

#### GET `/api/tasks/view-task?id=<taskId>`
Get single task by ID.

#### POST `/api/tasks/create-task`
Create a new task.

**Request Body:**
```json
{
  "title": "Task Title",
  "description": "Task description",
  "status": "To Do",
  "priority": "Medium",
  "dueDate": "31-12-2024",
  "transcript": "Optional voice transcript"
}
```

#### POST `/api/tasks/parse-voice`
Parse voice transcript and create task using AI.

**Request Body:**
```json
{
  "transcript": "Create a high priority task to review code by January 29, 2028"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Task created from voice input",
  "task": {
    "_id": "...",
    "title": "Review Code",
    "description": "Review code",
    "priority": "High",
    "dueDate": "29-01-2028",
    "status": "To Do"
  }
}
```

#### POST `/api/tasks/parse-voice-data`
Parse voice transcript and return structured data without creating task.

#### PUT `/api/tasks/update-task`
Update existing task.

**Request Body:**
```json
{
  "_id": "task_id",
  "title": "Updated Title",
  "status": "In Progress"
}
```

#### DELETE `/api/tasks/delete-task?id=<taskId>`
Delete task by ID.

## Project Structure

```
backend/
├── models/
│   └── Task.js           # Mongoose task schema
├── routes/
│   └── taskRoutes.js     # API route handlers
├── middleware/
│   └── connection.js     # MongoDB connection
├── server.js             # Express app entry point
├── .env                  # Environment variables
└── vercel.json           # Vercel deployment config
```

## Task Schema

```javascript
{
  title: String (required, 3-100 chars)
  description: String (required, 3-1000 chars)
  status: String (To Do | In Progress | Done)
  priority: String (Low | Medium | High | Critical)
  dueDate: String (DD-MM-YYYY format)
  transcript: String (voice input)
  createdAt: Date
  updatedAt: Date
}
```

## AI Task Parsing

The Gemini AI extracts:
- **Title**: Short action verb + object (20-60 chars)
- **Description**: Clean task description
- **Priority**: Low, Medium, High, or Critical
- **Due Date**: Parses relative dates (tomorrow, next week, etc.)

## Deployment

### Vercel
1. Deploy from `backend` directory
2. Add environment variables in Vercel dashboard
3. Vercel automatically uses `vercel.json` configuration

## Error Handling

- 400: Bad Request (validation errors)
- 404: Not Found (task doesn't exist)
- 500: Internal Server Error
- 503: Service Unavailable (AI service error)

## License

MIT
