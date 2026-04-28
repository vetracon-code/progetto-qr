const express = require('express');
const { Pool } = require('pg');
const webpush = require('web-push');
const path = require('path');

const app = express();
app.use(express.json());
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

// API LETTURA: Forziamo la pulizia dei dati in uscita
app.get('/api/reports', async (req, res) => {
    try {
        const query = `
            SELECT r.id, r.status, r.issue_type, r.created_at, poi.description as poi_name 
            FROM reports r 
            JOIN points_of_interest poi ON r.poi_id = poi.id 
            ORDER BY r.created_at DESC`;
        const result = await pool.query(query);
        console.log("Report letti dal DB:", result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error("ERRORE API GET REPORTS:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reports/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, operatore } = req.body;
    try {
        await pool.query(
            "UPDATE reports SET status = $1, assegnato_a = $2, completato_at = CASE WHEN $1 = 'risolta' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = $3",
            [status, operatore, id]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/report', async (req, res) => {
    const { poi_slug, issue_type } = req.body;
    try {
        const poiResult = await pool.query('SELECT id, description FROM points_of_interest WHERE slug = $1', [poi_slug]);
        if (poiResult.rows.length === 0) return res.status(404).send('POI non trovato');
        
        const poi = poiResult.rows[0];
        await pool.query('INSERT INTO reports (poi_id, issue_type, status) VALUES ($1, $2, $3)', [poi.id, issue_type, 'nuova']);

        const subs = await pool.query('SELECT subscription FROM push_subscriptions');
        const payload = JSON.stringify({
            title: 'Nuova Segnalazione!',
            body: `POI: ${poi.description} - Problema: ${issue_type}`,
            url: '/'
        });

        subs.rows.forEach(s => webpush.sendNotification(s.subscription, payload).catch(err => console.error(err)));
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
app.listen(PORT, () => console.log('Server in ascolto su porta ' + PORT));
