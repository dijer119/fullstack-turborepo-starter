const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

interface NewPost {
  feedTitle: string;
  title: string;
  link: string;
}

export async function sendNewPostsNotification(posts: NewPost[]) {
  if (!BOT_TOKEN || !CHAT_ID || posts.length === 0) return;

  const lines = posts.map(
    (p) => `- <a href="${p.link}">${escapeHtml(p.title)}</a> (${escapeHtml(p.feedTitle)})`
  );

  const message = `📬 새 글 ${posts.length}건\n\n${lines.join("\n")}`;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }).catch(() => {});
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
