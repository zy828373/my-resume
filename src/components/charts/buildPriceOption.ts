import type { EChartsOption } from "echarts";
import type { AnalysisResponse } from "../../types";

export function buildPriceOption(analysis: AnalysisResponse): EChartsOption {
  return {
    animationDuration: 350,
    textStyle: {
      fontFamily:
        '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(14, 20, 31, 0.96)",
      borderColor: "rgba(120, 150, 170, 0.24)",
      textStyle: { color: "#eef4ff" },
    },
    legend: {
      top: 2,
      right: 8,
      textStyle: { color: "#98a9bf", fontSize: 11 },
      data: ["BUFF", "悠悠有品", "MA7", "MA20", "成交量"],
    },
    grid: [
      { left: 50, right: 16, top: 32, height: "60%" },
      { left: 50, right: 16, top: "78%", height: "15%" },
    ],
    xAxis: [
      {
        type: "category",
        data: analysis.charts.labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#283447" } },
        axisLabel: { color: "#7f91a8", fontSize: 10 },
      },
      {
        type: "category",
        gridIndex: 1,
        data: analysis.charts.labels,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
      },
    ],
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
        gridIndex: 1,
        splitLine: { show: false },
        axisLabel: { color: "#7f91a8", fontSize: 10 },
      },
    ],
    series: [
      {
        name: "BUFF",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.buffClose,
        lineStyle: { color: "#2f7df6", width: 2.5 },
      },
      {
        name: "悠悠有品",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.yyypClose,
        lineStyle: { color: "#38c7b4", width: 2 },
      },
      {
        name: "MA7",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.ma7,
        lineStyle: { color: "#ffb549", width: 1.5 },
      },
      {
        name: "MA20",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.ma20,
        lineStyle: { color: "#ff7a5c", width: 1.5 },
      },
      {
        name: "成交量",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: analysis.charts.blendVolume.map((value, index) => ({
          value,
          itemStyle: {
            color:
              index > 0 &&
              analysis.charts.blendClose[index] < analysis.charts.blendClose[index - 1]
                ? "rgba(255, 98, 98, 0.52)"
                : "rgba(56, 199, 180, 0.42)",
          },
        })),
      },
    ],
  };
}
