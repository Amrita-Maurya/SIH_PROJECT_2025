// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

const MONGO_URL = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/farm_mgmt';
mongoose.connect(MONGO_URL).then(() => console.log('MongoDB connected'));

// Import divided routes
const dataEntryRoutes = require('../dataEntryRoutes');


// Use them
app.use('/api', dataEntryRoutes);


app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
