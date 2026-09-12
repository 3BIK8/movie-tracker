export const NETWORK_STYLES = [
  {
    selector: "edge",
    style: {
      width: 0.8,
      "line-color": "#94a3b8",
      opacity: 0.12,
      "curve-style": "bezier",
      "control-point-weights": 0.5,
      "control-point-distances": "data(curveDistance)",
      "z-index": 1,
    },
  },
  {
    selector: "edge[type='relationship']",
    style: {
      width: 0.7,
      "line-color": "#64748b",
      opacity: 0.08,
      "curve-style": "bezier",
      "control-point-weights": 0.5,
      "control-point-distances": "data(curveDistance)",
      "z-index": 1,
    },
  },
  {
    selector: "node[type='connection']",
    style: {
      width: 5,
      height: 5,
      shape: "ellipse",
      "background-color": "#94a3b8",
      "border-width": 1,
      "border-color": "#e2e8f0",
      label: "",
      "z-index": 2,
    },
  },
  {
    selector: "node[connectionType='actor']",
    style: { "background-color": "#f97316" },
  },
  {
    selector: "node[connectionType='director']",
    style: { "background-color": "#8b5cf6" },
  },
  {
    selector: "node[connectionType='genre']",
    style: { "background-color": "#22c55e", shape: "roundrectangle" },
  },
  {
    selector: "node[connectionType='franchise']",
    style: { "background-color": "#ef4444", shape: "hexagon" },
  },
  {
    selector: "node[connectionType='studio']",
    style: { "background-color": "#14b8a6", shape: "diamond" },
  },
  {
    selector: "node[connectionType='keyword']",
    style: { "background-color": "#ec4899" },
  },
  {
    selector: "node[connectionType='language']",
    style: { "background-color": "#eab308" },
  },
  {
    selector: "node[connectionType='decade']",
    style: { "background-color": "#64748b" },
  },
  {
    selector: "node[connectionType='mediaType']",
    style: { "background-color": "#06b6d4" },
  },
  {
    selector: "node[type='media']",
    style: {
      width: 18,
      height: 18,
      shape: "ellipse",
      "background-color": "#2563eb",
      "border-width": 2,
      "border-color": "#ffffff",
      label: "",
      "z-index": 3,
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
    selector: "node:selected",
    style: { "border-width": 3, "border-color": "#111827" },
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
    style: { width: 2, opacity: 0.75 },
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
      "text-margin-y": 7,
      "text-background-color": "#101114",
      "text-background-opacity": 0.9,
      "text-background-padding": 3,
      "z-index": 4,
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
    style: { opacity: 0 },
  },
];
