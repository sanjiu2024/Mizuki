import { getSortedPosts } from "@/utils/content-utils";

// 此API端点可预渲染为静态JSON文件
export const prerender = true;

export async function GET() {
	const posts = await getSortedPosts();

	const allPostsData = posts
		.map((post) => ({
			id: post.id,
			title: post.data.title,
			description: post.data.description,
			published: post.data.published.getTime(),
			category: post.data.category || "",
			password: !!post.data.password,
		}))
		// 按发布日期降序排列
		.sort((a, b) => b.published - a.published);

	return new Response(JSON.stringify(allPostsData), {
		headers: { "Content-Type": "application/json" },
	});
}
