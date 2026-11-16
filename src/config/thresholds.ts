/** Shared thresholds used by the data checks, the alert engine and the UI. */

/** No valid reading for more than this many days => Grey ("no recent data"). */
export const NO_DATA_GREY_DAYS = 7;

/**
 * Groundwater-fed sources (dug wells, stepwells) respond to rain with a delay
 * (infiltration). Rain is smoothed with this time constant (days) before it
 * drives recharge. This is a modelling assumption, not a hidden parameter.
 */
export const GROUNDWATER_RAIN_LAG_DAYS = 12;
