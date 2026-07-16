require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/auth');
const predictionsRouter = require('./routes/predictions');
const healthInputsRouter = require('./routes/healthInputs');
const pointsRouter = require('./routes/points');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/health-inputs', healthInputsRouter);
app.use('/api/points', pointsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AuraFit backend running on port ${PORT}`));
