import type { BaseNode, Edge } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";

const TYPE_COLORS: Record<string, string> = {
	Entity: "#4CAF50",
	Source: "#FF9800",
	Evidence: "#9C27B0",
	Proposition: "#2196F3",
};

const TYPE_LABELS: Record<string, string> = {
	Entity: "实体",
	Source: "来源",
	Evidence: "证据",
	Proposition: "命题",
};

const STATUS_COLORS: Record<string, string> = {
	proposed: "#90CAF9",
	supported: "#66BB6A",
	weakly_supported: "#AED581",
	contested: "#FFB74D",
	contradicted: "#EF5350",
	deprecated: "#BDBDBD",
	superseded: "#CE93D8",
	open: "#EF9A9A",
	in_progress: "#FFE082",
	resolved: "#A5D6A7",
	blocked: "#FFAB91",
	obsolete: "#BDBDBD",
	unresolved: "#FFCC80",
};

export class ExportHtmlService {
	constructor(private store: GraphStore) {}

	exportHtml(options?: { taskId?: string; focusId?: string; depth?: number }): string {
		const nodes = this.store.listNodes(options?.taskId ? (n) => {
			const taskIds = this.store.getNodeTaskIds(n.id);
			return !options?.taskId || taskIds.includes(options.taskId!);
		} : undefined);

		const edges = this.store.listEdges();

		// Filter edges to only those connecting nodes in our set
		const nodeIds = new Set(nodes.map((n) => n.id));
		const validEdges = edges.filter((e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId));

		// Filter to focus subgraph if specified
		let filteredNodes = nodes;
		let filteredEdges = validEdges;
		if (options?.focusId) {
			const depth = options.depth ?? 2;
			const reachable = this.bfsReachable(options.focusId, validEdges, depth);
			filteredNodes = nodes.filter((n) => reachable.has(n.id));
			filteredEdges = validEdges.filter((e) => reachable.has(e.fromId) && reachable.has(e.toId));
		}

		const graphData = {
			nodes: filteredNodes.map((n) => ({
				id: n.id,
				type: n.type,
				title: n.title,
				text: n.text?.slice(0, 200),
				summary: n.summary,
				status: n.status,
				confidence: n.confidence,
				attrs: n.attrs,
			})),
			edges: filteredEdges.map((e) => ({
				id: e.id,
				source: e.fromId,
				target: e.toId,
				type: e.type,
				label: e.type,
				confidence: e.confidence,
			})),
		};

		return buildHtml(graphData);
	}

	private bfsReachable(startId: string, edges: Edge[], maxDepth: number): Set<string> {
		const result = new Set<string>([startId]);
		let frontier = new Set<string>([startId]);
		for (let d = 0; d < maxDepth; d++) {
			const next = new Set<string>();
			for (const nid of frontier) {
				for (const e of edges) {
					if (e.fromId === nid && !result.has(e.toId)) next.add(e.toId);
					if (e.toId === nid && !result.has(e.fromId)) next.add(e.fromId);
				}
			}
			for (const n of next) result.add(n);
			frontier = next;
			if (next.size === 0) break;
		}
		return result;
	}
}

function buildHtml(data: { nodes: unknown[]; edges: unknown[] }): string {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Knowledge Graph Visualization</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #1a1a2e; color: #e0e0e0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow: hidden; }
#container { width: 100vw; height: 100vh; position: relative; }
svg { width: 100%; height: 100%; }
#sidebar { position: fixed; right: 0; top: 0; width: 360px; height: 100vh; background: #16213e; border-left: 1px solid #2a3a5e; transform: translateX(100%); transition: transform 0.3s ease; z-index: 100; overflow-y: auto; padding: 20px; }
#sidebar.open { transform: translateX(0); }
#sidebar h2 { font-size: 16px; color: #64b5f6; margin-bottom: 12px; word-break: break-all; }
#sidebar .field { margin-bottom: 10px; }
#sidebar .field-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
#sidebar .field-value { font-size: 14px; color: #e0e0e0; margin-top: 2px; word-break: break-all; }
#sidebar .close-btn { position: absolute; top: 12px; right: 12px; background: none; border: none; color: #888; font-size: 20px; cursor: pointer; }
#sidebar .close-btn:hover { color: #fff; }
#legend { position: fixed; left: 16px; bottom: 16px; background: #16213e; border: 1px solid #2a3a5e; border-radius: 8px; padding: 12px 16px; z-index: 50; }
#legend h3 { font-size: 12px; color: #888; margin-bottom: 8px; }
#legend .item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 12px; }
#legend .dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
#stats { position: fixed; left: 16px; top: 16px; background: #16213e; border: 1px solid #2a3a5e; border-radius: 8px; padding: 12px 16px; z-index: 50; }
#stats h3 { font-size: 12px; color: #888; margin-bottom: 6px; }
#stats .stat { font-size: 13px; margin-bottom: 2px; }
#stats .stat span { color: #64b5f6; }
#controls { position: fixed; right: 16px; bottom: 16px; display: flex; gap: 8px; z-index: 50; }
#controls button { background: #16213e; border: 1px solid #2a3a5e; color: #e0e0e0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
#controls button:hover { background: #2a3a5e; }
#search { position: fixed; left: 16px; top: 70px; z-index: 50; }
#search input { background: #16213e; border: 1px solid #2a3a5e; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; width: 240px; font-size: 13px; outline: none; }
#search input::placeholder { color: #666; }
#search input:focus { border-color: #64b5f6; }
.edge-label { font-size: 10px; fill: #888; pointer-events: none; }
.node-tooltip { pointer-events: none; }
</style>
</head>
<body>
<div id="container">
<svg id="graph"></svg>
</div>
<div id="sidebar">
<button class="close-btn" onclick="closeSidebar()">&times;</button>
<h2 id="sidebar-title"></h2>
<div id="sidebar-content"></div>
</div>
<div id="legend">
<h3>节点类型</h3>
${Object.entries(TYPE_LABELS).map(([kind, label]) => `<div class="item"><div class="dot" style="background:${TYPE_COLORS[kind]}"></div>${label}</div>`).join("\n")}
</div>
<div id="stats">
<h3>图谱统计</h3>
<div id="stats-content"></div>
</div>
<div id="search">
<input type="text" id="search-input" placeholder="搜索节点..." oninput="handleSearch(this.value)">
</div>
<div id="controls">
<button onclick="resetZoom()">重置视图</button>
<button onclick="toggleLabels()">标签开关</button>
<button onclick="exportSvg()">导出 SVG</button>
</div>
<script>
const GRAPH_DATA = ${JSON.stringify(data)};

const typeColors = ${JSON.stringify(TYPE_COLORS)};
const statusColors = ${JSON.stringify(STATUS_COLORS)};
const typeLabels = ${JSON.stringify(TYPE_LABELS)};

let showLabels = true;
let simulation, svg, g, linkGroup, nodeGroup, labelGroup;

function init() {
\tconst width = window.innerWidth;
\tconst height = window.innerHeight;

\tsvg = d3.select("#graph");
\tsvg.attr("viewBox", [0, 0, width, height]);

\tg = svg.append("g");

\t// Zoom
\tconst zoom = d3.zoom()
\t\t.scaleExtent([0.1, 8])
\t\t.on("zoom", (event) => g.attr("transform", event.transform));
\tsvg.call(zoom);

\t// Build index
\tconst nodeMap = {};
\tGRAPH_DATA.nodes.forEach(n => nodeMap[n.id] = n);

\t// Stats
\tconst typeCounts = {};
\tGRAPH_DATA.nodes.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });
\tlet statsHtml = '<div class="stat">节点: <span>' + GRAPH_DATA.nodes.length + '</span></div>';
\tstatsHtml += '<div class="stat">边: <span>' + GRAPH_DATA.edges.length + '</span></div>';
\tfor (const [k, v] of Object.entries(typeCounts)) {
\t\tstatsHtml += '<div class="stat">' + (typeLabels[k] || k) + ': <span>' + v + '</span></div>';
\t}
\tdocument.getElementById("stats-content").innerHTML = statsHtml;

\t// Force simulation
\tsimulation = d3.forceSimulation(GRAPH_DATA.nodes)
\t\t.force("link", d3.forceLink(GRAPH_DATA.edges).id(d => d.id).distance(100).strength(0.5))
\t\t.force("charge", d3.forceManyBody().strength(-300))
\t\t.force("center", d3.forceCenter(width / 2, height / 2))
\t\t.force("collision", d3.forceCollide().radius(30));

\t// Edges
\tlinkGroup = g.append("g").attr("class", "links");
\tconst link = linkGroup.selectAll("line")
\t\t.data(GRAPH_DATA.edges)
\t\t.enter().append("line")
\t\t.attr("stroke", "#444")
\t\t.attr("stroke-width", 1.5)
\t\t.attr("stroke-opacity", 0.6)
\t\t.on("click", (event, d) => showEdgeDetail(d));

\t// Edge labels
\tlabelGroup = g.append("g").attr("class", "labels");
\tconst edgeLabels = labelGroup.selectAll("text")
\t\t.data(GRAPH_DATA.edges)
\t\t.enter().append("text")
\t\t.attr("class", "edge-label")
\t\t.attr("text-anchor", "middle")
\t\t.text(d => d.type);

\t// Node groups
\tnodeGroup = g.append("g").attr("class", "nodes");
\tconst node = nodeGroup.selectAll("g")
\t\t.data(GRAPH_DATA.nodes)
\t\t.enter().append("g")
\t\t.attr("cursor", "pointer")
\t\t.call(d3.drag()
\t\t\t.on("start", dragStarted)
\t\t\t.on("drag", dragged)
\t\t\t.on("end", dragEnded))
\t\t.on("click", (event, d) => { event.stopPropagation(); showNodeDetail(d); });

\t// Node circles
\tnode.append("circle")
\t\t.attr("r", d => d.type === "Proposition" ? 10 : 7)
\t\t.attr("fill", d => typeColors[d.type] || "#666")
\t\t.attr("stroke", d => {
\t\t\tif (d.status && statusColors[d.status]) return statusColors[d.status];
\t\t\treturn "#333";
\t\t})
\t\t.attr("stroke-width", 2.5)
\t\t.attr("opacity", 0.9);

\t// Node labels
\tnode.append("text")
\t\t.attr("dy", -14)
\t\t.attr("text-anchor", "middle")
\t\t.attr("fill", "#ccc")
\t\t.attr("font-size", "11px")
\t\t.text(d => truncate(d.title || d.text || d.id, 20));

\t// Tick
\tsimulation.on("tick", () => {
\t\tlink
\t\t\t.attr("x1", d => d.source.x)
\t\t\t.attr("y1", d => d.source.y)
\t\t\t.attr("x2", d => d.target.x)
\t\t\t.attr("y2", d => d.target.y);
\t\tedgeLabels
\t\t\t.attr("x", d => (d.source.x + d.target.x) / 2)
\t\t\t.attr("y", d => (d.source.y + d.target.y) / 2 - 4);
\t\tnode.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
\t});

\t// Click background to close sidebar
\tsvg.on("click", () => closeSidebar());
}

function truncate(str, len) { return str.length > len ? str.slice(0, len) + "..." : str; }

function dragStarted(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnded(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

function showNodeDetail(d) {
\tconst sidebar = document.getElementById("sidebar");
\tdocument.getElementById("sidebar-title").textContent = d.title || d.text || d.id;
\tlet html = '';
\thtml += field("ID", d.id);
\thtml += field("类型", typeLabels[d.type] || d.type);
\thtml += field("状态", d.status || "-");
\thtml += field("置信度", d.confidence != null ? d.confidence.toFixed(2) : "-");
\tif (d.text) html += field("内容", d.text);
\tif (d.summary) html += field("摘要", d.summary);
\tif (d.attrs) {
\t\tfor (const [k, v] of Object.entries(d.attrs)) {
\t\t\tif (v != null && v !== "" && k !== "taskId" && k !== "taskIds") {
\t\t\t\thtml += field(k, typeof v === "object" ? JSON.stringify(v) : String(v));
\t\t\t}
\t\t}
\t}
\t// Show connected edges
\tconst connected = GRAPH_DATA.edges.filter(e => e.source.id === d.id || e.target.id === d.id);
\tif (connected.length > 0) {
\t\thtml += '<div class="field" style="margin-top:12px"><div class="field-label">关系 (' + connected.length + ')</div></div>';
\t\tconnected.forEach(e => {
\t\t\tconst other = e.source.id === d.id ? e.target : e.source;
\t\t\thtml += '<div class="field"><div class="field-value" style="color:#888;font-size:12px">' + e.type + ' → ' + truncate(other.title || other.text || other.id, 30) + '</div></div>';
\t\t});
\t}
\tdocument.getElementById("sidebar-content").innerHTML = html;
\tsidebar.classList.add("open");
}

function showEdgeDetail(d) {
\tconst sidebar = document.getElementById("sidebar");
\tdocument.getElementById("sidebar-title").textContent = "边: " + d.type;
\tlet html = '';
\thtml += field("ID", d.id);
\thtml += field("类型", d.type);
\thtml += field("源节点", (d.source.title || d.source.id));
\thtml += field("目标节点", (d.target.title || d.target.id));
\thtml += field("置信度", d.confidence != null ? d.confidence.toFixed(2) : "-");
\tdocument.getElementById("sidebar-content").innerHTML = html;
\tsidebar.classList.add("open");
}

function field(label, value) {
\treturn '<div class="field"><div class="field-label">' + label + '</div><div class="field-value">' + value + '</div></div>';
}

function closeSidebar() { document.getElementById("sidebar").classList.remove("open"); }

function resetZoom() {
\tsvg.transition().duration(500).call(d3.zoom().transform, d3.zoomIdentity);
}

function toggleLabels() {
\tshowLabels = !showLabels;
\tg.selectAll(".edge-label").attr("opacity", showLabels ? 1 : 0);
\tg.selectAll(".nodes text").attr("opacity", showLabels ? 1 : 0);
}

function exportSvg() {
\tconst svgEl = document.querySelector("svg");
\tconst serializer = new XMLSerializer();
\tconst svgStr = serializer.serializeToString(svgEl);
\tconst blob = new Blob([svgStr], { type: "image/svg+xml" });
\tconst url = URL.createObjectURL(blob);
\tconst a = document.createElement("a");
\ta.href = url; a.download = "knowledge-graph.svg"; a.click();
\tURL.revokeObjectURL(url);
}

let searchHighlight = null;
function handleSearch(query) {
\tif (searchHighlight) { searchHighlight.remove(); searchHighlight = null; }
\tif (!query.trim()) return;
\tconst q = query.toLowerCase();
\tconst matches = nodeGroup.selectAll("g").filter(d =>
\t\t(d.title || "").toLowerCase().includes(q) ||
\t\t(d.text || "").toLowerCase().includes(q) ||
\t\t(d.id || "").toLowerCase().includes(q)
\t);
\tif (!matches.empty()) {
\t\tsearchHighlight = matches.append("circle")
\t\t\t.attr("r", 20)
\t\t\t.attr("fill", "none")
\t\t\t.attr("stroke", "#FFD700")
\t\t\t.attr("stroke-width", 3)
\t\t\t.attr("stroke-dasharray", "4,2");
\t\tconst d = matches.datum();
\t\tif (d.x && d.y) {
\t\t\tsvg.transition().duration(500).call(
\t\t\t\td3.zoom().transform,
\t\t\t\td3.zoomIdentity.translate(window.innerWidth/2 - d.x, window.innerHeight/2 - d.y)
\t\t\t);
\t\t}
\t}
}
</script>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
if (typeof d3 !== "undefined") { init(); } else {
\tdocument.body.innerHTML = '<div style="color:#fff;padding:40px;text-align:center"><h2>加载 D3.js 失败</h2><p>请检查网络连接，D3 从 CDN 加载</p></div>';
}
</script>
</body>
</html>`;
}
