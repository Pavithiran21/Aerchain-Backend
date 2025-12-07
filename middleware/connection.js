let mongoose = require('mongoose');

let connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      authSource: 'admin'
    })
    console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB connection error:', err)
    console.error('Unable to connect: ' + err.message)
    process.exit(1)
  }
}

mongoose.connection.on('error', err => {
  console.error('MongoDB error:', err)
})

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected')
});

let getConnection = () => mongoose.connection.client;

module.exports = { connectDB, getConnection }
