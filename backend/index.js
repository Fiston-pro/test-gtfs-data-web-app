const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const OTP_URL = process.env.OTP_URL || 'http://localhost:8080';
const OTP_GRAPHQL = `${OTP_URL}/otp/gtfs/v1`;

// OTP 2.6+ schema: start/end replaced startTime/endTime, numberOfTransfers replaced transfers
const PLAN_QUERY = `
  query Plan(
    $fromLat: Float!, $fromLon: Float!,
    $toLat: Float!, $toLon: Float!,
    $date: String!, $time: String!
  ) {
    plan(
      from: { lat: $fromLat, lon: $fromLon }
      to:   { lat: $toLat,   lon: $toLon   }
      date: $date
      time: $time
      numItineraries: 3
      transportModes: [{ mode: WALK }, { mode: TRANSIT }]
    ) {
      itineraries {
        duration
        walkTime
        waitingTime
        numberOfTransfers
        legs {
          mode
          start { scheduledTime }
          end   { scheduledTime }
          duration
          distance
          transitLeg
          from { name lat lon }
          to   { name lat lon }
          route { shortName longName color }
          intermediateStops { name lat lon }
          legGeometry { points length }
        }
      }
    }
  }
`;

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString('pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/route', async (req, res) => {
  const { fromLat, fromLon, toLat, toLon } = req.query;

  if (!fromLat || !fromLon || !toLat || !toLon) {
    return res.status(400).json({ error: 'Missing coordinates: fromLat, fromLon, toLat, toLon required' });
  }

  // Accept optional date/time overrides — useful when GTFS has a limited service period
  const now = new Date();
  const date = req.query.date || now.toISOString().slice(0, 10);   // "YYYY-MM-DD"
  const time = req.query.time || now.toTimeString().slice(0, 8);   // "HH:MM:SS"

  try {
    const response = await axios.post(
      OTP_GRAPHQL,
      {
        query: PLAN_QUERY,
        variables: {
          fromLat: parseFloat(fromLat),
          fromLon: parseFloat(fromLon),
          toLat:   parseFloat(toLat),
          toLon:   parseFloat(toLon),
          date,
          time,
        },
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const { data, errors } = response.data;

    if (errors && errors.length) {
      console.error('OTP GraphQL errors:', errors);
      return res.status(500).json({ error: errors[0].message });
    }

    const plan = data?.plan;
    if (!plan || !plan.itineraries) {
      return res.status(500).json({ error: 'No plan returned from OTP' });
    }

    const itineraries = plan.itineraries.map((itin) => ({
      duration:    Math.round(itin.duration / 60),     // minutes
      walkTime:    Math.round(itin.walkTime / 60),     // minutes
      waitingTime: Math.round(itin.waitingTime / 60),  // minutes
      transfers:   itin.numberOfTransfers,
      legs: itin.legs.map((leg) => ({
        mode:      leg.mode,
        from:      leg.from.name || 'Unknown',
        to:        leg.to.name   || 'Unknown',
        startTime: formatTime(leg.start.scheduledTime),
        endTime:   formatTime(leg.end.scheduledTime),
        duration:  Math.round(leg.duration / 60),      // minutes
        distance:  leg.distance ? Math.round(leg.distance) : null, // meters
        isTransit: leg.transitLeg,
        line:      leg.route ? (leg.route.shortName || leg.route.longName || null) : null,
        color:     leg.route?.color ? `#${leg.route.color}` : null,
        stops:     (leg.intermediateStops || []).map((s) => s.name),
        geometry:  leg.legGeometry?.points || null,
      })),
    }));

    res.json({ itineraries });
  } catch (err) {
    console.error('OTP request failed:', err.message);
    res.status(502).json({
      error: 'Failed to reach OpenTripPlanner',
      detail: err.message,
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
