import type { EChartsOption } from "echarts";
import type { AnalysisResponse } from "../../types";

export function buildKdjOption(analysis: AnalysisResponse): EChartsOption {
  return {
    animationDuration: 280,
    tooltip: { trigger: "axis" },
    grid: { left: 34, right: 12, top: 22, bottom: 20 },
    xAxis: {
      type: "category",
      data: analysis.charts.labels,
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#283447" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
      axisLabel: { color: "#7f91a8", fontSize: 10 },
    },
    series: [
      {
        name: "K",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.kdj.k,
        lineStyle: { color: "#2f7df6", width: 1.8 },
      },
      {
        name: "D",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.kdj.d,
        lineStyle: { color: "#ffb549", width: 1.8 },
      },
      {
        name: "J",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.kdj.j,
        lineStyle: { color: "#ff6258", width: 1.8 },
      },
    ],
  };
}
