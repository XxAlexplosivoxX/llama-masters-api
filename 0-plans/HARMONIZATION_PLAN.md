# MODIS → VIIRS harmonization plan, v2 (Venezuela first)

NASA Space Apps 2026, *MODIS and VIIRS Hot Spots*. Goal: one consistent monthly
hotspot record, from Nov 2000 to today, on the **VIIRS scale**, for the country
and its states. It feeds the burning-activity calendar.

v2 builds on the teammates' existing app (`llama-masters-api/website`) and
replaces only its harmonization step. It incorporates the neutral review of
plan v1 against the app's current method (`/tmp/harmonization-compare/`).

## 1. Why change the current method

Neutral test on Venezuela: same data and filters; train 2012–19, test 2020–25;
monthly WAPE, each model judged in its own direction against its own
fixed-ratio baseline.

| Area | Current (VIIRS→MODIS power law, 0.1°) | Its fixed ratio | **Proposed (MODIS→VIIRS, cell × month, 0.5°)** | Its fixed ratio |
|---|---|---|---|---|
| Country | 11.8% | 7.8% | **6.1%** | 7.7% |
| Llanos | 13.6% | 9.4% | **5.9%** | 9.4% |
| Amazonas | 19.6% | 14.7% | **11.6%** | 15.7% |
| Gran Sabana | 55.2% (+55% bias) | 28.9% | **17.6%** | 23.3% |
| Zulia | 25.7% | **12.5%** | 16.3% | 12.7% |

- **The current model loses to its own fixed ratio everywhere.** The move to 0.1° made it worse: log1p fits on sparse counts flatten β to 0.32–0.63.
- **The proposed model beats its fixed ratio in 4 of 5 areas.** It fails in Zulia, so the per-area fallback (§4.3) matters.
- The two directions predict different sensors, so their WAPEs are not strictly comparable. The fair comparison is each model against its own baseline.
- **It is the wrong reference satellite.** The current method's VIIRS is S-NPP only, which ended 2026-11-02, and NOAA-20/21 are unused for history.
- **Gas flares are in the recent months.** NRT/API months keep them: 35.5% of Nov 2026 MODIS detections, 45% in Oct, 52% in Sep, against 18.6% in SP rows that have `type`.

## 2. Decisions

| Topic | Decision |
|---|---|
| Direction | **MODIS → VIIRS** (VIIRS is the continuing sensor) |
| Reference | **NOAA-20** (archived 2018–2025, operational) |
| What the record shows | **Real VIIRS wherever it exists; converted MODIS only for 2000-11 → 2011 and VIIRS gaps.** No averaging with MODIS |
| Geography | Country + states (point-in-polygon per detection) |
| Fitting grid | **0.5°**. Display: 0.5° for reconstructed years, 0.1° / real dots for VIIRS years |
| Points | Never synthesized. Counts are converted; MODIS rows get a `viirs_weight` |
| Baseline | **Median** per calendar month as the headline, with mean shown alongside (the challenge mentions both) |
| Keep from the current app | Download cache, API rate-limit handling, 0.1° country mask, `localCheck` per-area score, CSV columns, the whole frontend |

## 3. Data and cleaning

| Sensor | Period | Source |
|---|---|---|
| MODIS C6.1 Terra + Aqua | 2000-11 → now (both still in the files on 2026-11-14/15) | Archive ≤2025, API 2026 |
| VIIRS S-NPP | 2012-01-20 → 2026-11-02 | Archive ≤2025 |
| VIIRS NOAA-20 | 2018-04-01 → now | Archive ≤2025, API 2026 |
| VIIRS NOAA-21 | 2023-03 → now | API only |

1. **Clip** API rows to the 0.1° archive cell mask. Archive rows are already clipped by NASA.
2. **Static sources:**
   - Use `type == 0` where present.
   - Otherwise use the **static-source mask**: archive cells with `type ≠ 0` (0.005° VIIRS, 0.01° MODIS, no dilation). Measured: catches 98% of static detections and removes 0.5% of fires.
3. **Confidence:**
   - MODIS ≥ 30.
   - VIIRS: drop `low`, to match the current pipeline. The effect is small either way; report it.
4. Prefer **SP over NRT**, and label NRT months provisional.
5. **Partial months** (S-NPP Jan 2012, NOAA-20 Mar 2018, NOAA-21 Feb 2023) are excluded from fitting. A month with no source data is **null, not 0**.
6. Store only `latitude`, `longitude` (float32), `acq_date`, and `satellite` (MODIS). Add `acq_time`, `confidence`, `frp` for the export.

## 4. Method

### 4.1 One VIIRS series, 2012 → now
For each month, use the first satellite with complete coverage:

```
NOAA-20 (×1) → NOAA-21 (× f21) → S-NPP (× fNPP) → converted MODIS (gap fill)
```

- **fNPP**: NOAA-20/S-NPP ratio of sums, fitted on 2018-04 → 2025. Measured overall ≈ 0.985 (yearly 0.959–0.997). Choose between one constant, per calendar month, per state, or by activity level with leave-one-year-out WAPE, and take the simplest option that is not clearly worse.
- **f21**: one factor, fitted on 2023-03 → 2026-10. Measured 0.993; monthly noise ±5%, no stable seasonality.
- **Never sum satellites.**

### 4.2 Converting MODIS to VIIRS (2000-11 → 2011)
For each 0.5° cell c and month t, with calendar month m:

```
VIIRS_eq(c,t) = R_c × F_m × MODIS(c,t)
```

- **R_c**: the cell's ratio of sums, ΣVIIRS/ΣMODIS (the Poisson maximum-likelihood estimate), shrunk toward the national ratio with k = 200 MODIS detections. k is chosen by leave-one-year-out WAPE.
- **F_m**: national calendar-month factor.
- **Fit** on S-NPP vs combined Terra+Aqua, then × fNPP to reach NOAA-20 scale. Use **combined** MODIS only, never per-satellite coefficients.
- **Terra-only months** (2000-11 → 2002-06): multiply Terra counts by the month-specific (Terra+Aqua)/Terra factor (≈ 2.42) first.
- **Background term (optional):** `B(c,m)` is added **only where MODIS(c,t) = 0**, and only if it improves validation. At 0.5° it moves just ~1.5% of VIIRS detections; at 0.1° it hurts.
- **States:** convert per cell, then split each cell by its detections' state shares.

### 4.3 Fallback per area
Where the cell × month model does not beat a fixed ratio for an area or state out-of-sample (e.g. Zulia), use that area's own **ratio of sums × F_m** instead, and record which model was used.

### 4.4 Uncertainty (MVP)
- **Country level and each state:** p10–p90 from leave-one-year-out error ratios (real ÷ predicted). Report coverage on held-out years; target ~80%.
- **Later:** stratify the bands by count size at cell level.

## 5. Validation

Every metric is out-of-sample (leave-one-year-out, plus train 2012–19 / test 2020–25), per country and per state. The truth is real VIIRS.

| Test | Metric | Target |
|---|---|---|
| Accuracy | Monthly WAPE | Country ≤ 10%; states reported, weakest flagged |
| **Beats the simpler methods** | WAPE vs fixed ratio and vs ratio × F_m | Must win, else use the simpler one (§4.3) |
| Bias | Annual Σpred / Σreal − 1 | Within ±5% |
| Year ranking | Spearman ρ | ≥ 0.9 |
| Alert | "Above median" flag agreement | ≥ 90% |
| Bands | p10–p90 coverage | ~80% |
| Other satellite | Repeat with NOAA-20 as truth | Same ranking of methods |
| Seam | Converted MODIS vs real VIIRS, 2012–2025 chart | No break at 2012 |
| Plausibility | Pixel matching (~2 VIIRS px per MODIS px, ~72% small fires missed → ~7.3× Aqua); White 2022 Venezuela Aqua ratio 6.81 | Same ballpark |

These targets were set **after** the first results were seen. They are reporting thresholds, not proof of pre-registration. Report failures as they are.

## 6. Outputs

**For the app:** a `monthly_grid.json` that is compatible with the current app, built with one extra series:
- `viirs_eq`: real VIIRS on the NOAA-20 scale where observed, converted MODIS otherwise.
- Per month: `source` (observed / reconstructed / filled), the satellite used, and `p10` / `p90` where reconstructed.
- Also: the coefficients (R_c, F_m, fNPP, f21, Terra factor), the scorecard and the method/caveats text.

**Data files** (`data/processed/venezuela/`):
- `monthly_state.csv`: `state, month, value, p10, p90, source, satellite, provisional, coverage_days`
- `baseline.csv`: median, mean, p25 and p75 per state × calendar month, 2003–2025
- `scale_factors.csv`, `scorecard.json`, `metadata.json`

**User CSV:** real detections with `latitude, longitude, acq_date, acq_time, satellite, confidence, frp, provisional, viirs_weight`.

## 7. Changes in the current app

1. **`scripts/build-country.mjs`:**
   - Add the NOAA-20 (and NOAA-21) archive/API to the history.
   - Apply the static-source mask to NRT/API rows.
   - Replace step 4 with §4.
   - Fit at 0.5° even though the grid is 0.1° (aggregate for fitting, apply per 0.1° cell with its parent's R_c).
2. **`src/lib/series.ts`:** the harmonized record is `viirs_eq` (no averaging). Keep MODIS-only / VIIRS-only views for inspection.
3. **`src/lib/currentMonth.ts`:**
   - Median as the headline.
   - Compare like with like for a partial month: the same days of past months, using daily counts. If daily counts aren't kept, label the comparison as partial.
4. **UI:**
   - Draw 2000–2011 lighter or hatched, with p10–p90 in the tooltip.
   - Sensors panel text: "1 MODIS ≈ ~5 VIIRS here (by place and season)".
5. **Docs:**
   - Fix "3.7×" (Brazil) to the per-country value (Venezuela ≈ 4.6×).
   - Fix the NOAA-20 archive note.
   - Fix "a few industrial hotspots" to the measured share.

## 8. Order of work

**MVP (do first)**
1. Cleaning + monthly counts + VIIRS chain (§3, §4.1).
2. Conversion (§4.2), with the fallback (§4.3).
3. Validation per country/state (§5) and a country band (§4.4).
4. Export to `monthly_grid.json` + app changes (§7.1–7.3).

**Later**
- Cell-level bands stratified by count size.
- The background term if it passes.
- The 0.25° test.
- Ecoregion areas.
- Other countries.
- Forecast (NASA POWER + ENSO, MLForecast with conformal intervals, against a "25%" baseline).

## 9. Risks and open points

- **S-NPP's early years:** its ratio to MODIS rises over 2012–16 (3.8 → 5.1), possibly from early-mission changes. Test fitting on 2013+ (or 2014+) and weighting.
- **Drift:** no clear post-2020 drift in Venezuela's combined MODIS. Re-check per state.
- **Small or sparse states** (and Zulia-like areas) may fall back to simpler ratios. Show wide bands, don't hide them.
- **MODIS `version` mix** (`6.03`, `6.2`, `61.03`): check for steps before fitting.
- **2001 is high** (~307k VIIRS-eq). Raw Terra confirms 2001 > 2003; keep it with the wider Terra-only band.
- **Pixel matching** was done on S-NPP 2019 only; re-check on NOAA-20.
- **0.5° fitting** limits draw-an-area accuracy for 2000–2011. Say so in the UI.
