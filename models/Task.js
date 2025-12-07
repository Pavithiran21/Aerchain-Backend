const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    minLength: [10, 'Title must be at least 10 characters'],
    maxLength: [250, 'Title must not exceed 250 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    minLength: [10, 'Description must be at least 10 characters'],
    maxLength: [500, 'Description must not exceed 500 characters']
  },
  status: {
    type: String,
    enum: {
      values: ['To Do', 'In Progress', 'Done'],
      message: 'Status must be To Do, In Progress, or Done'
    },
    default: 'To Do'
  },
  priority: {
    type: String,
    enum: {
      values: ['Low', 'Medium', 'High', 'Critical'],
      message: 'Priority must be Low, Medium, High, or Critical'
    },
    required: [true, 'Priority is required']
  },
  dueDate: {
    type: String,
    required: [true, 'Due date is required']
  },
  transcript: {
    type: String,
    minLength: [10, 'Transcript must be at least 10 characters'],
    maxLength: [1000, 'Transcript must not exceed 1000 characters']
  }
}, { versionKey: false })

module.exports = mongoose.model('Task', taskSchema);
