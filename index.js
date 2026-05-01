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

// API ADMIN: Crea un nuovo punto (POI)
app.post('/api/admin/create-poi', async (req, res) => {
    const { description, slug, service_id } = req.body;
    console.log("Tentativo creazione POI:", { description, slug, service_id });
    
    try {
        const query = 'INSERT INTO points_of_interest (description, slug, service_type_id) VALUES ($1, $2, $3) RETURNING *';
        const result = await pool.query(query, [description, slug, service_id]);
        console.log("POI Creato con successo:", result.rows[0]);
        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error("ERRORE CREAZIONE POI:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// API LETTURA REPORTS
app.get('/api/reports', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.status, r.issue_type, poi.description as poi_name 
            FROM reports r 
            JOIN points_of_interest poi ON r.poi_id = poi.id 
            ORDER BY r.created_at DESC`);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// API STATO
app.post('/api/reports/:id/status', async (req, res) => {
    try {
        await pool.query("UPDATE reports SET status = $1 WHERE id = $2", [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// INVIO SEGNALAZIONE (User Side)
app.post('/api/report', async (req, res) => {
    const { poi_slug, issue_type } = req.body;
    try {
        const poi = await pool.query('SELECT id, description FROM points_of_interest WHERE slug = $1', [poi_slug]);
        if (poi.rows.length === 0) return res.status(404).send('POI non trovato');
        await pool.query('INSERT INTO reports (poi_id, issue_type, status) VALUES ($1, $2, $3)', [poi.rows[0].id, issue_type, 'nuova']);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server Admin & App in ascolto...'));
