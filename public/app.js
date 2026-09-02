let map = null;
let vehicleMarker = null;
let poolingIntervalTimer = null;
let simulationStepTracker = 0;

function initializeMap(initialLat, initialLng) {
    if (map) return;
    map = L.map('live-map').setView([initialLat, initialLng], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap Contributors SML Logistics Analytics'
    }).addTo(map);
    vehicleMarker = L.marker([initialLat, initialLng]).addTo(map)
        .bindPopup('<b>SML Telemetry Carrier</b><br/>Streaming live analytical vector math.')
        .openPopup();
}

async function startTrackingPipeline() {
    if(poolingIntervalTimer) clearInterval(poolingIntervalTimer);
    await fetchLiveTelemetryStream();
    poolingIntervalTimer = setInterval(fetchLiveTelemetryStream, 4000);
}

async function fetchLiveTelemetryStream() {
    const id = document.getElementById('track-id').value.trim();
    if (!id) return alert("Please specify an active tracking identifier.");
    const response = await fetch(`/api/track/${id}`);
    if (response.status === 404) {
        clearInterval(poolingIntervalTimer);
        return alert("Tracking reference ID could not be located in database assets.");
    }
    const { shipment, events, analytics } = await response.json();
    document.getElementById('stat-distance').innerText = analytics.distance_remaining_miles;
    document.getElementById('stat-eta').innerText = analytics.estimated_hours_remaining;
    document.getElementById('stat-speed').innerText = shipment.average_speed_mph;
    document.getElementById('lbl-sender').innerText = shipment.sender;
    document.getElementById('lbl-receiver').innerText = shipment.receiver;
    document.getElementById('lbl-path').innerText = `${shipment.origin} ➔ ${shipment.destination}`;
    initializeMap(shipment.lat, shipment.lng);
    const nextPosition = new L.LatLng(shipment.lat, shipment.lng);
    vehicleMarker.setLatLng(nextPosition);
    map.panTo(nextPosition);
    const log = document.getElementById('geo-history-log');
    log.innerHTML = '';
    events.forEach(ev => {
        const item = document.createElement('li');
        item.innerHTML = `<b>${ev.location}</b>: ${ev.remarks}`;
        log.appendChild(item);
    });
}

async function simulateDriverMovement() {
    const id = document.getElementById('track-id').value.trim();
    if (!id) return alert("Search a tracking ID first to simulate.");
    simulationStepTracker = (simulationStepTracker + 1) % 4;
    await fetch('/api/driver/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: id, step: simulationStepTracker })
    });
    await fetchLiveTelemetryStream();
        }
                            
