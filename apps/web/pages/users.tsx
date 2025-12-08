import React, { useState } from 'react';
import {
    useGetUsersQuery,
    useCreateUserMutation,
    useDeleteUserMutation,
} from '../src/store/services/users-api';
import Header from '../src/components/Header';

const UsersPage = () => {
    const { data: users, isLoading, error } = useGetUsersQuery();
    const [createUser] = useCreateUserMutation();
    const [deleteUser] = useDeleteUserMutation();

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return;
        try {
            await createUser({ email, name });
            setEmail('');
            setName('');
        } catch (err) {
            console.error('Failed to create user:', err);
        }
    };

    const handleDeleteUser = async (id: number) => {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                await deleteUser({ id });
            } catch (err) {
                console.error('Failed to delete user:', err);
            }
        }
    };

    if (isLoading) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <Header />
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent"></div>
            </div>
        </div>
    );

    if (error) return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <Header />
            <div className="container mx-auto px-4 py-8 max-w-7xl">
                <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-6 py-4 rounded-lg">
                    ⚠️ Error loading users:
                    <pre className="mt-2 text-sm bg-slate-800/50 p-4 rounded text-slate-300">
                        {JSON.stringify(error, null, 2)}
                    </pre>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <Header />
            <div className="container mx-auto px-4 py-8 max-w-7xl">
                {/* 페이지 타이틀 */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                        👤 User Management
                    </h1>
                    <p className="text-slate-400">
                        사용자를 추가하고 관리합니다
                    </p>
                </div>

                {/* Create User Form */}
                <div className="bg-slate-800/50 rounded-lg p-6 mb-8 border border-slate-700/50">
                    <h2 className="text-xl font-semibold text-white mb-4">Add New User</h2>
                    <form onSubmit={handleCreateUser} className="flex gap-4 items-end flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label htmlFor="email" className="block text-sm font-medium text-slate-400 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2 bg-slate-900/80 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                                placeholder="user@example.com"
                                required
                            />
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label htmlFor="name" className="block text-sm font-medium text-slate-400 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2 bg-slate-900/80 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                                placeholder="John Doe"
                            />
                        </div>
                        <button
                            type="submit"
                            className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors font-medium"
                        >
                            Add User
                        </button>
                    </form>
                </div>

                {/* User List */}
                <div className="bg-slate-800/30 rounded-2xl border border-slate-700/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-800/50 border-b border-slate-700/50">
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">
                                        ID
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">
                                        Email
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">
                                        Name
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">
                                        Created At
                                    </th>
                                    <th className="px-6 py-4 text-right text-sm font-semibold text-slate-400">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {users?.map((user) => (
                                    <tr key={user.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                            {user.id}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                                            {user.email}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                            {user.name || '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">
                                            {new Date(user.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button
                                                onClick={() => handleDeleteUser(user.id)}
                                                className="text-red-400 hover:text-red-300 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {(!users || users.length === 0) && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                                            No users found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UsersPage;
