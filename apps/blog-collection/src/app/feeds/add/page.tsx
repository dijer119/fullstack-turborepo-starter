import { FeedForm } from "@/components/feed/FeedForm";

export default function AddFeedPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Add RSS Feed</h1>
      <FeedForm />
    </div>
  );
}
