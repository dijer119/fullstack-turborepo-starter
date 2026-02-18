import { PostList } from "@/components/post/PostList";
import { SearchBar } from "@/components/ui/SearchBar";
import { TagFilter } from "@/components/ui/TagFilter";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; tag?: string; favorites?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const search = params.search || undefined;
  const tag = params.tag || undefined;
  const showFavorites = params.favorites === "true";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          {showFavorites ? "Favorites" : "All Posts"}
        </h1>
        <a
          href={showFavorites ? "/" : "/?favorites=true"}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showFavorites ? "Show All" : "Show Favorites"}
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <SearchBar defaultValue={search} />
        <TagFilter currentTag={tag} />
      </div>

      <PostList
        page={page}
        search={search}
        tag={tag}
        showFavorites={showFavorites}
      />
    </div>
  );
}
