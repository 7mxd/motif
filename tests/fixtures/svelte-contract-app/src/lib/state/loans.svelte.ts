// What a member borrows and reserves in this visit, in memory. Only clicks change it, and they run in the browser, so
// the server always draws it empty and no visitor sees another's.
import { findTool, type Tool } from '$lib/mock-data';

export interface Loan {
	toolId: string;
	dueBack: Date;
}

export const loans = $state<{ out: Loan[]; reserved: string[] }>({ out: [], reserved: [] });

/** Borrowed today, due back after the tool's longest loan. */
export function borrow(tool: Tool): void {
	if (loans.out.some((l) => l.toolId === tool.id)) return;
	const due = new Date();
	due.setDate(due.getDate() + tool.loanDays);
	loans.out.push({ toolId: tool.id, dueBack: due });
}

export function reserve(tool: Tool): void {
	if (!loans.reserved.includes(tool.id)) loans.reserved.push(tool.id);
}

export const loanOf = (id: string): Loan | undefined => loans.out.find((l) => l.toolId === id);

/** Soonest due first, as My loans lists them. */
export const loansByDue = (): { loan: Loan; tool: Tool }[] =>
	loans.out
		.map((loan) => ({ loan, tool: findTool(loan.toolId)! }))
		.sort((a, b) => a.loan.dueBack.getTime() - b.loan.dueBack.getTime());
