import Head from 'next/head';
import { TodoScreen } from '../src/screens/TodoScreen';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <Head>
        <title>Full-stack Todo App | Modern & Fast</title>
        <meta name="description" content="A production-ready todo application built with Next.js, NestJS, and RTK Query." />
      </Head>
      <main className="container mx-auto px-4">
        <TodoScreen />
      </main>
    </div>
  );
}
