import { createContext, useContext } from "react";

/**
 * Broadcasts whether the user's cursor is over an ECharts canvas.
 * Parent SpotlightCard / TiltedCard wrappers read this to suppress
 * their own hover effects — otherwise the chart tooltip and the card
 * tilt fight for the same mouse events.
 */
export const HoveringChartContext = createContext<boolean>(false);

export function useHoveringChart(): boolean {
  return useContext(HoveringChartContext);
}
