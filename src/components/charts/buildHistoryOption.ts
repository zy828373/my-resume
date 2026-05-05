import type { EChartsOption } from "echarts";
import type { HistoryPlaybackResponse } from "../../types";
import { formatDateTime } from "../../utils/format";

export function buildHistoryOption(historyPlayback: HistoryPlaybackResponse): EChartsOption {
  const labels = historyPlayback.points.map((point) => formatDateTime(point.at));

  return {
    animationDuration: 280,
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      right: 8,
      textStyle: { color: "#98a9bf", fontSize: 11 },
      data: ["BUFF", "悠悠有品", "卖压"],
    },
    grid: { left: 42, right: 48, top: 28, bottom: 24 },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: "#283447" } },
      axisLabel: { color: "#7f91a8", fontSize: 10 },
    },
    yAxis: [
      {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
        axisLabel: {
          color: "#7f91a8",
          formatter: (value: number) => `¥${Math.round(value)}`,
        },
      },
      {
        type: "value",
        min: 0,
        splitLine: { show: false },
        axisLabel: {
          color: "#7f91a8",
          formatter: (value: number) => `${value.toFixed(1)}x`,
        },
      },
    ],
    series: [
      {
        name: "BUFF",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: historyPlayback.points.map((point) => point.buffClose),
        lineStyle: { color: "#2f7df6", width: 2 },
      },
      {
        name: "悠悠有品",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: historyPlayback.points.map((point) => point.yyypClose),
        lineStyle: { color: "#38c7b4", width: 2 },
      },
      {
        name: "卖压",
        type: "line",
        yAxisIndex: 1,
        showSymbol: false,
        smooth: true,
        data: historyPlayback.points.map((point) => point.sellPressure),
        lineStyle: { color: "#ffb549", width: 1.8, type: "dashed" },
        areaStyle: { color: "rgba(255, 181, 73, 0.12)" },
      },
    ],
  };
}
