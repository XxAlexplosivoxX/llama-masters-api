# Forecasting burning activity

This is the broader modeling roadmap. The [hackathon plan](HACKATHON_PLAN.md)
overrides its scope for the two-day event: forecasting is optional, point
predictions can be evaluated without intervals, and weather integration and
TimeGPT comparison may be deferred.

Start with XGBoost through Nixtla's MLForecast and benchmark it against TimeGPT
and a seasonal baseline. This is a proposed experiment; no model has been trained
or evaluated on this project's data yet.

Nixtla and XGBoost are complementary choices: Nixtla provides forecasting tools,
while XGBoost is a model that can be used within a forecasting workflow.

## Approaches to compare

| Approach | Role | Main tradeoff |
|---|---|---|
| Seasonal baseline | Predict typical activity for each region and week of the year | Simple and interpretable, but limited response to unusual conditions |
| XGBoost with MLForecast | Combine past activity, seasonality, weather, and regional features | Requires feature engineering and training |
| TimeGPT | Establish a pretrained forecasting benchmark | Requires API access and evaluation on fire activity data |

MLForecast provides tools for constructing forecasting features and evaluating
machine learning models. TimeGPT supports additional predictors and prediction
intervals. Neither approach is assumed to outperform the seasonal baseline.

Sources:

- MLForecast: https://github.com/Nixtla/mlforecast
- TimeGPT: https://github.com/Nixtla/nixtla
- Nixtla predictor and interval documentation: https://nixtla.github.io/nixtlar/

## Prediction task

Initially predict weekly harmonized burning activity for each selected region,
one week ahead. Evaluate extending the horizon to two through four weeks after
establishing the first benchmark.

The exact activity measure and geographic aggregation must be defined and
validated during harmonization. Raw hotspot counts are not unique fire counts
and should not be interpreted as burned area or the probability of a new ignition.

Each XGBoost training row would describe a region at a forecast date:

- Previous weeks' activity and rolling summaries computed from past observations.
- Week of year and historical seasonal activity.
- Recent rainfall, temperature, and vegetation measurements, if available.
- Regional characteristics and satellite observation coverage, if available.
- Target: harmonized burning activity in the following week.

XGBoost uses the supplied columns; lagged features explicitly provide temporal
history. Any predictors needed for future weeks must be known at the forecast
date or supplied by a separate forecast. Historical evaluation must use weather
forecasts that were available at the time, rather than subsequently observed weather.

## Data prerequisites

The current global seven-day FIRMS downloads in `data/` support ingestion and
recent activity mapping. They are insufficient for learning and evaluating annual
seasonality. Obtain multiple years of historical MODIS and VIIRS observations for
the selected regions, including overlapping sensor periods.

Before forecasting:

1. Standardize fields, timestamps, units, and sensor-specific quality rules.
2. Aggregate observations into common spatial and temporal units.
3. Distinguish observed zero activity from missing or obscured observations.
   Hotspot-only files may need supplementary observation coverage information.
4. Develop and validate adjustments for differences in sensors and observation
   opportunities using overlapping records. Aggregation alone is insufficient.
5. Check that changes in satellites do not create artificial jumps in activity.

Neither XGBoost nor TimeGPT automatically solves MODIS–VIIRS harmonization.

## Evaluation and selection

Compare all three approaches on the same target, regions, forecast dates, and
horizons. Repeatedly train on earlier observations and predict subsequent weeks;
do not randomly split time series rows into training and test sets.

Fit preprocessing, sensor adjustments, and feature transformations within each
training period when they learn from data. Keep future observations out of model
selection and feature construction.

Assess:

- Forecast error, using measures such as MAE and error relative to the seasonal
  baseline; avoid relying on percentage errors when activity can be zero.
- Ability to identify unusually active periods, including missed peaks and false
  alerts under a predefined operational threshold.
- Prediction interval coverage and width. Include an explicit uncertainty method
  for XGBoost; ordinary point predictions do not supply calibrated intervals.
- Performance across regions, seasons, activity levels, and sensor transitions.
- Runtime, API and infrastructure costs, and deployment complexity.

Choose the approach supported by those results. A combination of models is an
option only if it improves held-out performance.

## Application outputs

| Output | Question answered |
|---|---|
| Historical burning calendar | Which weeks usually have the most burning here? |
| Anomaly detection | Is current activity unusual for this region and season? |
| Forecast with uncertainty | How much activity should we expect over the next few weeks? |

Implement the historical calendar and anomaly baseline first, then add validated
forecasts. Keep measured activity, historical expectations, and future predictions
clearly distinguished in the interface.
