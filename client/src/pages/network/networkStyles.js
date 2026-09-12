export const NETWORK_STYLES = [
  {
    selector: "node[type='media']",
    style: {
      width: 54,
      height: 54,
      shape: "ellipse",
      "background-color": "#2563eb",
      "border-width": 3,
      "border-color": "#ffffff",
      label: "",
    },
  },
  {
    selector: "node[type='media'][status='not_sure']",
    style: { "background-color": "#eab308" },
  },
  {
    selector: "node[type='media'][status='to_watch']",
    style: { "background-color": "#22c55e" },
  },
  {
    selector: "node[connectionType='actor']",
    style: {
      width: "mapData(count, 2, 10, 28, 48)",
      height: "mapData(count, 2, 10, 28, 48)",
      "background-color": "#f97316",
      "border-width": 2,
      "border-color": "#ffffff",
      label: "",
    },
  },
  {
    selector: "node[connectionType='director']",
    style: {
      width: "mapData(count, 2, 10, 30, 50)",
      height: "mapData(count, 2, 10, 30, 50)",
      "background-color": "#8b5cf6",
      "border-width": 2,
      "border-color": "#ffffff",
      label: "",
    },
  },
  {
    selector: "node[connectionType='genre']",
    style: {
      width: "mapData(count, 2, 20, 24, 42)",
      height: "mapData(count, 2, 20, 24, 42)",
      shape: "roundrectangle",
      "background-color": "#22c55e",
      "border-width": 2,
      "border-color": "#ffffff",
      label: "",
    },
  },
  {
    selector: "node[connectionType='franchise']",
    style: {
      width: "mapData(count, 2, 10, 32, 52)",
      height: "mapData(count, 2, 10, 32, 52)",
      shape: "hexagon",
      "background-color": "#ef4444",
      "border-width": 2,
      "border-color": "#ffffff",
      label: "",
    },
  },
  {
    selector: "node[connectionType='decade']",
    style: {
      width: 18,
      height: 18,
      shape: "rectangle",
      "background-color": "#64748b",
      "border-width": 1,
      "border-color": "#ffffff",
      label: "",
    },
  },
  {
    selector: "node[connectionType='studio']",
    style: {
      width: "mapData(count, 2, 20, 22, 40)",
      height: "mapData(count, 2, 20, 22, 40)",
      shape: "diamond",
      "background-color": "#14b8a6",
      "border-width": 1,
      "border-color": "#ffffff",
      label: "",
    },
  },
  {
    selector: "node[connectionType='language']",
    style: { width: 16, height: 16, "background-color": "#eab308", label: "" },
  },
  {
    selector: "node[connectionType='keyword']",
    style: { width: 12, height: 12, "background-color": "#ec4899", label: "" },
  },
  {
    selector: "node[connectionType='mediaType']",
    style: { width: 16, height: 16, "background-color": "#06b6d4", label: "" },
  },
  {
    selector: "edge",
    style: {
      width: 1.5,
      "line-color": "#94a3b8",
      opacity: 0.3,
      "curve-style": "bezier",
      "control-point-weights": 0.5,
      "control-point-distances": "data(curveDistance)",
    },
  },
  {
    selector: "edge[type='relationship']",
    style: {
      width: 1,
      "line-color": "#64748b",
      opacity: 0.18,
      "curve-style": "bezier",
      "control-point-weights": 0.5,
      "control-point-distances": "data(curveDistance)",
    },
  },
  {
    selector: "node:selected",
    style: { "border-width": 4, "border-color": "#111827" },
  },
  {
    selector: ".highlighted",
    style: { opacity: 1 },
  },
  {
    selector: ".dimmed",
    style: { opacity: 0.08 },
  },
  {
    selector: "edge.highlighted",
    style: { width: 3, opacity: 1 },
  },
  {
    selector: ".show-label[displayLabel]",
    style: {
      label: "data(displayLabel)",
      color: "#ffffff",
      "font-size": 10,
      "font-weight": "bold",
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 8,
      "text-background-color": "#101114",
      "text-background-opacity": 0.9,
      "text-background-padding": 3,
    },
  },
  {
    selector: "node.filtered-out",
    style: {
      opacity: 0,
      label: "",
      events: "no",
    },
  },
  {
    selector: "edge.filtered-out",
    style: {
      opacity: 0,
    },
  },
];
