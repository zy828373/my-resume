import type { EChartsOption } from "echarts";
import type { AnalysisResponse } from "../../types";

export function buildMacdOption(analysis: AnalysisResponse): EChartsOption {
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
      splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
      axisLabel: { color: "#7f91a8", fontSize: 10 },
    },
    series: [
      {
        name: "MACD",
        type: "bar",
        data: analysis.indicators.macd.hist.map((value) => ({
          value,
          itemStyle: {
            color: value >= 0 ? "rgba(255, 122, 92, 0.7)" : "rgba(56, 199, 180, 0.7)",
          },
        })),
      },
      {
        name: "DIF",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.macd.dif,
        lineStyle: { color: "#2f7df6", width: 1.8 },
      },
      {
        name: "DEA",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.macd.dea,
        lineStyle: { color: "#ffb549", width: 1.8 },
      },
    ],
  };
}
