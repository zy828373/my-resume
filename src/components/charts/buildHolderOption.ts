import type { EChartsOption } from "echarts";
import type { AnalysisResponse } from "../../types";

export function buildHolderOption(analysis: AnalysisResponse): EChartsOption {
  return {
    animationDuration: 300,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 46, right: 14, top: 20, bottom: 48 },
    xAxis: {
      type: "category",
      data: analysis.holders.rows.map((row) => row.steamName),
      axisLabel: {
        color: "#7f91a8",
        fontSize: 10,
        rotate: 24,
      },
      axisLine: { lineStyle: { color: "#283447" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#7f91a8", fontSize: 10 },
      splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
    },
    series: [
      {
        type: "bar",
        data: analysis.holders.rows.map((row) => row.num),
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#ffb549" },
              { offset: 1, color: "rgba(255, 122, 92, 0.38)" },
            ],
          },
          borderRadius: [6, 6, 0, 0],
        },
      },
    ],
  };
}
