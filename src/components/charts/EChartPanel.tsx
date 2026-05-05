import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import type { EChartsType } from "echarts/core";
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
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(option);
  const [hovering, setHovering] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    async function mountChart() {
      if (!ref.current) return;

      try {
        setLoadError(null);
        const { createEChart } = await import("./loadEcharts");
        if (!ref.current || disposed) return;

        const chart = createEChart(ref.current);
        chartRef.current = chart;
        chart.setOption(optionRef.current, { notMerge: true, lazyUpdate: true });

        resizeObserver = new ResizeObserver(() => chart.resize());
        resizeObserver.observe(ref.current);
      } catch (error) {
        if (!disposed) {
          resizeObserver?.disconnect();
          chartRef.current?.dispose();
          chartRef.current = null;
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    void mountChart();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [retryKey]);

  useEffect(() => {
    optionRef.current = option;
    if (!chartRef.current) return;
    try {
      chartRef.current.setOption(option, { notMerge: true, lazyUpdate: true });
      setLoadError(null);
    } catch (error) {
      chartRef.current.dispose();
      chartRef.current = null;
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [option]);

  return (
    <HoveringChartContext.Provider value={hovering}>
      <div
        ref={ref}
        className="chart-area"
        style={{ width: "100%", height }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {loadError ? (
          <span className="chart-error" role="alert">
            图表加载失败：{loadError}
            <button type="button" onClick={() => setRetryKey((key) => key + 1)}>
              重试加载图表
            </button>
          </span>
        ) : null}
      </div>
    </HoveringChartContext.Provider>
  );
}
