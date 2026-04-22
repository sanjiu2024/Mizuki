import { getSortedPosts } from "../../utils/content-utils";

// 此API端点可预渲染为静态JSON文件
export const prerender = true;

export async function GET() {
	const posts = await getSortedPosts();

	const allPostsData = posts.map((post) => {
		const date = new Date(post.data.published);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");

		return {
			id: post.id,
			title: post.data.title,
			date: `${year}-${month}-${day}`,
		};
	});

	return new Response(JSON.stringify(allPostsData), {
		headers: {
			"Content-Type": "application/json",
		},
	});
}
