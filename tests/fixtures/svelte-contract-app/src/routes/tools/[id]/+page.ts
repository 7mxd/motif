import { error } from '@sveltejs/kit';
import { findTool } from '$lib/mock-data';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const tool = findTool(params.id);
	if (!tool) error(404, 'No tool has that id.');
	return { tool };
};
