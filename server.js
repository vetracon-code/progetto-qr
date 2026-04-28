const express = require('express');
const { Pool } = require('pg');
const webpush = require('web-push');

const app = express();
app.use(express.json());

// LOG DI SICUREZZA: Stampa ogni singola richiesta che arriva
app.use((req, res, next) => {
    console.log(`RICHIESTA ARRIVATA: ${req.method} ${req.url}`);
    next();
});

app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

app.get('/api/reports', async (req, res) => {
    try {
        const result = await pool.query("SELECT r.id, r.status, r.issue_type, poi.description as poi_name FROM reports r JOIN points_of_interest poi ON r.poi_id = poi.id ORDER BY r.created_at DESC");
        console.log("Dati inviati all'app:", result.rows.length, "righe");
        res.json(result.rows);
    } catch (err) {
        console.error("Errore DB:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reports/:id/status', async (req, res) => {
    try {
        await pool.query("UPDATE reports SET status = $1 WHERE id = $2", [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/report', async (req, res) => {
    const { poi_slug, issue_type } = req.body;
    try {
        const poi = await pool.query('SELECT id, description FROM points_of_interest WHERE slug = $1', [poi_slug]);
        await pool.query('INSERT INTO reports (poi_id, issue_type, status) VALUES ($1, $2, $3)', [poi.rows[0].id, issue_type, 'nuova']);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/push/subscribe', async (req, res) => {
    try {
        await pool.query('INSERT INTO push_subscriptions (subscription) VALUES ($1)', [req.body.subscription]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('--- SERVER RIAVVIATO E PRONTO ---'));
