const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});


const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'sml_local.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return console.error(err.message);
    console.log(`Connected to database file at: ${dbPath}`);
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tracking_number TEXT UNIQUE, sender TEXT, receiver TEXT, origin TEXT, destination TEXT,
        dest_lat REAL, dest_lng REAL, lat REAL, lng REAL, average_speed_mph REAL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS tracking_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tracking_number TEXT, status TEXT, location TEXT, remarks TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

const LA_HUB = { lat: 34.0522, lng: -118.2437 };
const ROUTE_SIMULATION = [
    { lat: 40.7128, lng: -74.0060, remark: "Departed sorting facility terminal in New York." }, 
    { lat: 39.9526, lng: -75.1652, remark: "Passing interstate clearing checkpoint in Philadelphia." },     
    { lat: 39.7392, lng: -104.9903, remark: "Transiting mountain pass distribution point in Denver." },         
    { lat: 34.0560, lng: -118.2000, remark: "Entering local delivery zone corridor in Los Angeles." }       
];

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const toRadians = angle => (angle * Math.PI) / 180;
    const EarthRadiusMiles = 3958.8;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EarthRadiusMiles * c;
}

app.post('/api/shipments', (req, res) => {
    const { sender, receiver, origin, destination } = req.body;
    const trackingNumber = `SML-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const startPos = ROUTE_SIMULATION;
    db.run(`INSERT INTO shipments (tracking_number, sender, receiver, origin, destination, dest_lat, dest_lng, lat, lng, average_speed_mph) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [trackingNumber, sender, receiver, origin, destination, LA_HUB.lat, LA_HUB.lng, startPos.lat, startPos.lng, 65.0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO tracking_events (tracking_number, status, location, remarks) VALUES (?,?,?,?)`,
        [trackingNumber, "In Transit", origin, startPos.remark], () => {
            res.status(201).json({ tracking_number: trackingNumber });
        });
    });
});

app.get('/api/track/:tracking_number', (req, res) => {
    db.get(`SELECT * FROM shipments WHERE tracking_number = ?`, [req.params.tracking_number], (err, shipment) => {
        if (!shipment) return res.status(404).json({ error: 'Manifest ID records missing.' });
        const remainingDistance = calculateHaversineDistance(shipment.lat, shipment.lng, shipment.dest_lat, shipment.dest_lng);
        const remainingHours = remainingDistance / shipment.average_speed_mph;
        db.all(`SELECT * FROM tracking_events WHERE tracking_number = ? ORDER BY timestamp DESC`, [req.params.tracking_number], (eventErr, events) => {
            res.json({
                shipment,
                events,
                analytics: {
                    distance_remaining_miles: Math.round(remainingDistance),
                    estimated_hours_remaining: parseFloat(remainingHours.toFixed(1))
                }
            });
        });
    });
});

app.post('/api/driver/telemetry', (req, res) => {
    const { tracking_number, step } = req.body;
    const index = Math.min(parseInt(step) || 0, ROUTE_SIMULATION.length - 1);
    const currentLoc = ROUTE_SIMULATION[index];
    db.run(`UPDATE shipments SET lat = ?, lng = ? WHERE tracking_number = ?`, [currentLoc.lat, currentLoc.lng, tracking_number], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        db.run(`INSERT INTO tracking_events (tracking_number, status, location, remarks) VALUES (?,?,?,?)`,
        [tracking_number, "In Transit", `GPS-Node-${index}`, currentLoc.remark], () => {
            res.json({ status: "GPS Coordinates Updated Successfully" });
        });
    });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Analytical Shipping API Live on Port ${PORT}`));
      
