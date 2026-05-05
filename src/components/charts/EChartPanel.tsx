import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import { HoveringChartContext } from "./HoveringChartContext";

export interface EChartPanelProps {
  option: EChartsOption;
  height: number;
}

/**
 * ECharts canvas wrapper. Broadcasts hover state through HoveringChartContext
 * so wrapping card primitives can pause their own hover effects while the
 * cursor is over the chart.
 */
export function EChartPanel({ option, height }: EChartPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption(option, { notMerge: true, lazyUpdate: true });
  }, [option]);

  return (
    <HoveringChartContext.Provider value={hovering}>
      <div
        ref={ref}
        className="chart-area"
        style={{ width: "100%", height }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      />
    </HoveringChartContext.Provider>
  );
}
