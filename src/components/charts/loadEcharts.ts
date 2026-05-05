import { init, use } from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

let registered = false;

export function createEChart(element: HTMLDivElement) {
  if (!registered) {
    use([
      BarChart,
      LineChart,
      GridComponent,
      LegendComponent,
      TooltipComponent,
      CanvasRenderer,
    ]);
    registered = true;
  }

  return init(element, undefined, { renderer: "canvas" });
}
