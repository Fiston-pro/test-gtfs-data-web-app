# GTFS Transit Router

A local transit routing app powered by **OpenTripPlanner** and real **GTFS data**.
Give it two coordinates → get back a full journey plan: walking legs, bus/tram lines, transfers, stop names, and duration.

Think of it as a local, offline **Jakdojade** that runs entirely from a GTFS zip file — no Google Maps, no external APIs.

---

## What you'll see when it's running

- A map with your route drawn on it (walking = gray dashed, bus/tram = colored line)
- Up to 3 route options, ranked by total travel time
- Each option broken into legs: 🚶 Walk → 🚌 Bus 174 → 🚃 Tram 1 → 🚶 Walk
- Departure times, stop names, line numbers, transfer count, and total duration

---

## How it works

```
You (browser)
    │  lat/lon coords
    ▼
Node.js backend  ──GraphQL──▶  OpenTripPlanner (Java, in Docker)
                                       │
                               ┌───────┴────────┐
                           GTFS .zip         OSM .pbf
                         (bus/tram routes)  (streets + footpaths)
```

OTP builds a routing graph from your GTFS + OSM files, then uses the **RAPTOR** algorithm to find the fastest combinations of walking + transit — exactly how apps like Jakdojade work under the hood.

---

## Prerequisites

Before you start, make sure you have:

- [ ] **Docker Desktop** installed and running — [download here](https://www.docker.com/products/docker-desktop/)
- [ ] **Docker has at least 4 GB RAM** allocated (see [Docker memory](#docker-memory) if unsure)
- [ ] A **GTFS zip file** for your city (see Step 1)
- [ ] ~5 GB free disk space

That's it. No Java, no Node.js, no npm needed on your machine.

---

## Step 1 — Get your data files

You need two files. Both go in the `otp/` folder.

### 1a. GTFS file (transit schedules)

This contains all the bus/tram routes, stops, and timetables for your city.

| City | Download |
|------|----------|
| **Kraków** | https://gtfs.ztp.krakow.pl |
| Warsaw | https://mkuran.pl/gtfs/ |
| Any city | https://www.transit.land/feeds — search your city |

Download it and place it in the `otp/` folder. Name it anything ending in `.gtfs.zip`:

```
otp/krakow.gtfs.zip
```

### 1b. OSM file (street map for walking legs)

Download the `.osm.pbf` for your region from [Geofabrik](https://download.geofabrik.de).

For Kraków → go to Europe → Poland → [Małopolskie](https://download.geofabrik.de/europe/poland/malopolskie-latest.osm.pbf)

> ⚠️ The full region file is ~185 MB and needs 6+ GB RAM to build.
> **We strongly recommend cropping it to just your city first** (Step 2 below — takes 30 seconds).

Place the downloaded file in `otp/`:

```
otp/malopolskie-latest.osm.pbf
```

---

## Step 2 — Crop OSM to your city (recommended)

This reduces the OSM file from ~185 MB to ~33 MB and cuts build RAM usage in half.
Skip this if you have 6+ GB allocated to Docker.

**Kraków bounding box:**

```bash
# Mac / Linux
docker run --rm \
  -v "$(pwd)/otp:/data" \
  iboates/osmium \
  extract --bbox 19.79,49.97,20.12,50.13 \
  /data/malopolskie-latest.osm.pbf \
  -o /data/krakow.osm.pbf \
  --overwrite
```

```powershell
# Windows (PowerShell)
docker run --rm `
  -v "${PWD}/otp:/data" `
  iboates/osmium `
  extract --bbox 19.79,49.97,20.12,50.13 `
  /data/malopolskie-latest.osm.pbf `
  -o /data/krakow.osm.pbf `
  --overwrite
```

When it finishes, you'll have `otp/krakow.osm.pbf` (~33 MB). You can delete the original big file.

**For other cities** — find your bounding box at [bboxfinder.com](http://bboxfinder.com) (draw a box around your city, copy the coordinates).

---

## Step 3 — Build the routing graph (one-time, ~5–10 min)

This reads your GTFS + OSM files and produces `otp/graph.obj` — the routing graph OTP uses for all queries.

**You only need to do this once.** After that, OTP just loads the graph on startup.

```bash
# Mac / Linux
docker run --rm \
  -v "$(pwd)/otp:/var/opentripplanner" \
  opentripplanner/opentripplanner:2.6.0 \
  --build --save
```

```powershell
# Windows (PowerShell)
docker run --rm `
  -v "${PWD}/otp:/var/opentripplanner" `
  opentripplanner/opentripplanner:2.6.0 `
  --build --save
```

```bash
# Windows (Git Bash) — use full path
docker run --rm \
  -v "C:/Users/YOU/gtfs-web-app/otp:/var/opentripplanner" \
  opentripplanner/opentripplanner:2.6.0 \
  --build --save
```

**How to know it worked:** You'll see `Graph saved` near the end of the logs, and a new file `otp/graph.obj` will appear in the folder.

> If you see `OutOfMemoryError` → see [Docker memory](#docker-memory) below.

---

## Step 4 — Start the app

```bash
docker-compose up
```

This starts two containers:

| Container | URL | What it does |
|-----------|-----|--------------|
| OTP | `localhost:8080` | Loads `graph.obj`, handles routing queries |
| Backend | `localhost:3000` | Express API, translates requests to OTP GraphQL |

**How to know it's ready:** Wait until you see this line in the logs:
```
otp-1  | ... Grizzly server running.
```
Takes about 30–60 seconds after `docker-compose up`.

---

## Step 5 — Open the frontend

Open this file directly in your browser — no server needed:

```
frontend/index.html
```

On Windows you can double-click it, or drag it into Chrome/Firefox.

---

## Using the app

1. **Click on the map** to set your start point (first click = origin 🔵, second click = destination 🔴)
   — or type coordinates manually in the form
2. Click **Find Route**
3. Results appear as cards on the left, route drawn on the map on the right

### Test coordinates for Kraków

| Place | Lat | Lon |
|-------|-----|-----|
| Main Train Station | 50.0673 | 19.9477 |
| Wawel Castle | 50.0543 | 19.9355 |
| Nowa Huta | 50.0694 | 20.0419 |
| AGH University | 50.0661 | 19.9236 |
| Galeria Krakowska | 50.0647 | 19.9468 |

Try: **Main Station → Nowa Huta** for a route with a bus and a tram leg.

---

## Stopping the app

```bash
docker-compose down
```

---

## Project structure

```
gtfs-web-app/
├── docker-compose.yml        # Starts OTP + backend
├── otp/
│   ├── build-config.json     # OTP build settings
│   ├── router-config.json    # Walk speed, transfer slack, etc.
│   ├── yourcity.gtfs.zip     # ← YOU add this (gitignored)
│   ├── yourcity.osm.pbf      # ← YOU add this (gitignored)
│   └── graph.obj             # ← generated by Step 3 (gitignored)
├── backend/
│   ├── index.js              # Express server — /route endpoint, OTP GraphQL queries
│   ├── package.json
│   └── Dockerfile
└── frontend/
    └── index.html            # Map UI — Leaflet.js, no build step needed
```

---

## API reference

The backend exposes one endpoint:

```
GET http://localhost:3000/route?fromLat=50.0673&fromLon=19.9477&toLat=50.0694&toLon=20.0419
```

Example response:

```json
{
  "itineraries": [
    {
      "duration": 34,
      "walkTime": 8,
      "waitingTime": 3,
      "transfers": 1,
      "legs": [
        {
          "mode": "WALK",
          "from": "Origin",
          "to": "Dworzec Główny Wschód",
          "startTime": "08:04",
          "endTime": "08:08",
          "duration": 4,
          "distance": 264,
          "line": null,
          "isTransit": false
        },
        {
          "mode": "BUS",
          "from": "Dworzec Główny Wschód",
          "to": "Plac Centralny",
          "startTime": "08:11",
          "endTime": "08:38",
          "duration": 27,
          "line": "174",
          "stops": ["Teatr Słowackiego", "Rynek Główny", "Stradom"],
          "isTransit": true
        }
      ]
    }
  ]
}
```

---

## Troubleshooting

### `OutOfMemoryError` during graph build

Docker doesn't have enough RAM.

→ Docker Desktop → Settings → Resources → Memory → set to **6 GB** → Apply & Restart → retry Step 3.

### `graph.obj` not found when starting OTP

You skipped Step 3 or the build failed silently.

→ Check that `otp/graph.obj` exists. If not, re-run the build command from Step 3.

### Backend can't connect to OTP

OTP is still loading. It takes 30–60 seconds after `docker-compose up`.

→ Watch the logs for `Grizzly server running`, then refresh.

### No routes found

- Make sure your coordinates are within the area covered by your GTFS + OSM data
- Check that the date/time matches your GTFS feed's validity period (feeds usually expire after 3–12 months)

### Windows path errors during build (Git Bash)

Git Bash converts Unix paths like `/var/opentripplanner` to Windows paths.

→ Use the full Windows path with `C:/` instead of `$(pwd)`:
```bash
-v "C:/Users/YOU/gtfs-web-app/otp:/var/opentripplanner"
```

---

## Docker memory

To check or change Docker Desktop's memory allocation:

1. Open Docker Desktop
2. Click the ⚙️ Settings icon
3. Go to **Resources** → **Memory**
4. Set to **6 GB** (or more)
5. Click **Apply & Restart**

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Routing engine | [OpenTripPlanner 2.6](https://www.opentripplanner.org/) |
| Routing algorithm | RAPTOR (multi-criteria transit routing) |
| Transit data format | GTFS (General Transit Feed Specification) |
| Street data | OpenStreetMap `.osm.pbf` via Geofabrik |
| Backend | Node.js + Express |
| OTP query interface | GraphQL at `/otp/gtfs/v1` |
| Frontend | Plain HTML + [Leaflet.js](https://leafletjs.com/) |
| Infrastructure | Docker Compose |
