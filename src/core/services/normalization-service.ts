import type { BaseNode } from "../models/types";
import type { GraphStore } from "../../storage/graph-store";
import type { GraphService } from "./graph-service";

export class NormalizationService {
	constructor(
		private store: GraphStore,
		private graphService: GraphService,
	) {}

	findDuplicateEntities(taskId?: string): Array<{ entities: BaseNode[]; reason: string }> {
		const entities = this.graphService.listNodes({ type: "Entity", taskId });
		const results: Array<{ entities: BaseNode[]; reason: string }> = [];
		const seen = new Set<string>();

		for (let i = 0; i < entities.length; i++) {
			if (seen.has(entities[i].id)) continue;

			const group: BaseNode[] = [entities[i]];
			let reason = "";

			for (let j = i + 1; j < entities.length; j++) {
				if (seen.has(entities[j].id)) continue;

				const e1 = entities[i];
				const e2 = entities[j];

				// Same entityType and similar name
				const entityType1 = (e1.attrs?.entityType as string) ?? "";
				const entityType2 = (e2.attrs?.entityType as string) ?? "";
				if (entityType1 === entityType2) {
					const nameSimilarity = this.stringSimilarity(
						(e1.title ?? "").toLowerCase(),
						(e2.title ?? "").toLowerCase(),
					);

					if (nameSimilarity > 0.8) {
						group.push(e2);
						seen.add(e2.id);
						reason = `名称高度相似 (${(nameSimilarity * 100).toFixed(0)}%)，类型相同 (${entityType1 || "未指定"})`;
						continue;
					}

					// Check alias overlap
					const aliases1 = (e1.attrs?.aliases as string[] | undefined) ?? [];
					const aliases2 = (e2.attrs?.aliases as string[] | undefined) ?? [];
					const names1 = [e1.title, ...aliases1].filter(Boolean).map((s) => s!.toLowerCase());
					const names2 = [e2.title, ...aliases2].filter(Boolean).map((s) => s!.toLowerCase());
					const hasOverlap = names1.some((n1) =>
						names2.some((n2) => n1 === n2 || this.stringSimilarity(n1, n2) > 0.85),
					);
					if (hasOverlap) {
						group.push(e2);
						seen.add(e2.id);
						reason = `名称或别名存在重叠，类型相同 (${entityType1 || "未指定"})`;
					}
				}
			}

			if (group.length > 1) {
				seen.add(entities[i].id);
				results.push({
					entities: group,
					reason: reason || `名称或别名存在重叠`,
				});
			}
		}

		return results;
	}

	findDuplicatePropositions(taskId?: string): Array<{ propositions: BaseNode[]; reason: string }> {
		const propositions = this.graphService.listNodes({ type: "Proposition", taskId });
		const results: Array<{ propositions: BaseNode[]; reason: string }> = [];
		const seen = new Set<string>();

		for (let i = 0; i < propositions.length; i++) {
			if (seen.has(propositions[i].id)) continue;

			const group: BaseNode[] = [propositions[i]];
			let reason = "";

			for (let j = i + 1; j < propositions.length; j++) {
				if (seen.has(propositions[j].id)) continue;

				const text1 = (propositions[i].text ?? "").toLowerCase();
				const text2 = (propositions[j].text ?? "").toLowerCase();
				const similarity = this.stringSimilarity(text1, text2);

				if (similarity > 0.75) {
					group.push(propositions[j]);
					seen.add(propositions[j].id);
					reason = `命题文本高度相似 (${(similarity * 100).toFixed(0)}%)`;
				}
			}

			if (group.length > 1) {
				seen.add(propositions[i].id);
				results.push({
					propositions: group,
					reason: reason || `命题文本高度相似`,
				});
			}
		}

		return results;
	}

	private stringSimilarity(a: string, b: string): number {
		if (a === b) return 1;
		if (a.length === 0 || b.length === 0) return 0;

		const lenA = a.length;
		const lenB = b.length;

		let matches = 0;
		let j = 0;
		for (let i = 0; i < lenA && j < lenB; i++) {
			if (a[i] === b[j]) {
				matches++;
				j++;
			} else {
				const idx = b.indexOf(a[i], j);
				if (idx !== -1 && idx - j < 3) {
					matches++;
					j = idx + 1;
				}
			}
		}

		return (2 * matches) / (lenA + lenB);
	}
}
