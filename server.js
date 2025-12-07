require('dotenv').config();
let express = require('express');
let cors = require('cors');
let taskRoutes = require('./routes/taskRoutes');
let { connectDB } = require('./middleware/connection'); 

let app = express();
let port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/tasks', taskRoutes);

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});