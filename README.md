# WellCast

**A weather forecast for wells.** WellCast is an AI early-warning system for water sources in India's arid west, covering the Thar Desert (Rajasthan) and Kutch (Gujarat). It predicts when a well, pond, stepwell or tank is likely to fail, says how confident it is, and warns the people who depend on it weeks before it runs dry, in a way that fits how each person uses that water.

Built for **Breaking Bytes: Chapter 1 (The Underground Hackathon)**, Track 2: Water & Climate AI.

- **Live demo:** _add Vercel link_
- **Demo video:** _add YouTube link_

---

## The problem

In the Thar and Kutch, villages, herders and farmers depend on a small number of water sources. Today people usually find out a source is failing only when it is already dry. By then the options are a long journey, buying tanker water, or losing livestock.

The same source is also used in very different ways. A woman carrying water home, a herder watering 300 animals, and a farmer running a borewell all need a **different** warning about the **same** well.

## What WellCast does

1. **Reads data** about each water source: daily level readings, rainfall, temperature, vegetation greenness around the source, and how much each group of people draws from it.
2. **Learns each source's behaviour** from its own past readings (regression), then **forecasts** its level weeks ahead with a confidence range.
3. **Raises an alert** only when the evidence is strong enough, then **sends a warning tailored to each type of user**, in Hindi or English, with the nearest suitable safe alternative.

### Four purposes, one engine

The app is organised around **how people use water**, not around a single user:

| Tab | Who | What they're told |
|---|---|---|
| **Fetch & Carry** | Households, tanker operators | Which safe source to use instead, and how far it is |
| **Use on Spot** | Herders, people bathing/washing, travellers | Where to move herds or go, and by when |
| **Pump at Scale** | Farmers with borewells | How much to cut pumping, and how much time that buys |
| **Manage & Oversee** | Panchayat, district water officer, NGOs | The full picture: sources at risk and people affected |

All four tabs share one map, one data layer and one forecast engine. Each tab is a different "lens" on the same data.

## How the AI works

- **Learning:** for every source, a regression model learns its recharge from rain, its evaporation loss, its usage rate per group of users, and its background groundwater trend, from that source's own past readings. Nothing is hand-set. The source panel shows the learned values and the model fit (R²).
- **Forecasting:** the learned model is run **500 times** with realistic variation in rain, usage and noise. This gives a forecast band (P10 to P90) and statements like *"Likely to fail in 1-3 weeks (70% confident)."*
- **Checking the learning:** the simulator's true parameters are hidden from the model. A test checks that the model recovers them within tolerance.
- **Scenarios:** the forecast can be re-run with pumping cut by 30% to show farmers exactly how much time that gains.

## Balancing false alarms and missed alarms

A false alarm costs trust; a missed one costs lives. WellCast uses:

- **Tiers:** Safe, Watch, Warning, Emergency, plus No data (never hidden).
- **Agreement:** escalating beyond Watch needs at least 2 of 3 signals (level dropping faster than normal, rain deficit, vegetation browning).
- **Persistence:** a tier must hold for 3 consecutive days before escalating.
- **Confidence in every message**, e.g. "70% sure."
- **No duplicates:** the same source and tier is never sent twice, and nothing is sent when a source improves.
- **Honesty:** if no suitable safe source is within reach, the warning says so and tells people to contact the Panchayat, rather than sending them hundreds of kilometres away.

## Handling messy desert data

- Sensor gaps are shown, never hidden, and the forecast band **widens** when data is missing.
- A source with no reading for 7+ days turns **grey** ("No data"), and nearby users are asked to check it and reply (1 = water low, 2 = still fine).
- Sensor glitches are detected and ignored by the model, and marked on the chart.
- Cloudy satellite readings are skipped, and the last good value is used and labelled.

## Built for basic phones

Field users (herders, households, travellers) get **SMS-length messages** on basic phones: no app, no internet, no login. Every message fits in 1-2 SMS in both English and Hindi, and the app shows the character count and SMS segments. In the demo, messages are delivered to a **simulated basic phone**. In a real deployment they would go out through a registered SMS sender ID (DLT in India) via an SMS gateway.

## Data: real vs simulated

Every dataset is labelled **REAL** or **SIMULATED**, in the code and in the interface.

| Data | Status |
|---|---|
| India boundary (Survey of India) and state lines | **REAL**, from DataMeet |
| Water sources and their locations | **SIMULATED**, illustrative locations |
| Daily sensor readings, quarterly groundwater measurements | **SIMULATED** |
| Rainfall, temperature, vegetation greenness (NDVI) | **SIMULATED** |
| Usage by type of user, recipient counts | **SIMULATED** |

The simulation is realistic: levels drop faster in summer heat and with heavy use, rise slightly after the monsoon, and include sensor gaps, outages and glitches. Real data (e.g. CGWB groundwater levels from India-WRIS) can be dropped into `data/real/`; the data layer then uses it automatically and the badge switches to REAL.

The demo includes **scripted scenarios** (for example, farm pumping restarting near Well #4) so judges can watch a source move from Safe to Warning using the batch clock. These are planted events in the simulation, stated openly here.

## Maps and boundaries

The map is drawn entirely from official boundary data (no third-party map tiles), so India is shown with the boundary recognised by the Government of India, including all of Jammu & Kashmir and Ladakh. The globe view shows the rest of the world as plain land with no borders.

## Tech stack

- **Next.js 16** (React 19, TypeScript), Tailwind CSS
- **three.js / react-three-fiber** for the 3D globe
- Forecast model, regression and alert engine written in TypeScript (Next.js API routes)
- **Vitest** for tests
- Hosted on **Vercel**

## Run it locally

```
npm install
npm run generate
npm run dev
```

Then open http://localhost:3000.

Run the tests with:

```
npm test
```

## Demo walkthrough

1. Start on the **globe**, click India to fly in to Thar and Kutch.
2. Open **Use on Spot** and select the **Herder**: Nadi #9 is likely to fail in 1-3 weeks; the herder is told to move herds to Well #22 (4 km).
3. Click the alternative to see the route on the map.
4. Open the **Field phone** and switch between English and Hindi.
5. Press **+7 days** on the batch clock: new warnings arrive and the dispatch log updates.
6. Open **Pump at Scale** to see what cutting pumping by 30% gains.
7. Open **Manage & Oversee** for the Panchayat's overall view.

## Hackathon rules

- All app code was written during the hackathon window, from scratch. No existing repositories or templates were copied.
- Standard open-source packages (Next.js, three.js, etc.) are used as dependencies.
- Code was written with AI assistance (Claude Code) and reviewed by the team.

## Credits and licences

- India boundary: `india-soi.geojson` by the [DataMeet India community](https://github.com/datameet/maps), CC BY-SA 2.5 / ODbL. Simplified by us and shared under the same terms.
- State lines: DataMeet, CC BY 4.0.
- World land: Natural Earth (public domain).

