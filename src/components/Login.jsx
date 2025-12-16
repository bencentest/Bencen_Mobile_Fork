import React, { useState } from 'react';
import { supabase } from '../services/supabase';
import { Loader2, LogIn } from 'lucide-react';

export function Login({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            if (onLoginSuccess) onLoginSuccess(data.session);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#FDF8F5] p-4 text-neutral-800">
            <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-xl p-8">

                {/* Logo & Header */}
                <div className="text-center mb-8">
                    <img src="/bencen-logo.png" alt="Bencen" className="h-10 mx-auto mb-6" />
                    <h2 className="text-2xl font-bold mb-2 tracking-tight">Iniciar Sesión</h2>
                    <p className="text-neutral-500 text-sm">
                        Ingresa a tu cuenta para continuar
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleLogin} className="space-y-5">

                    {/* Email */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-bold text-neutral-700 ml-1">Email</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
                                </svg>
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 focus:border-[#FF884D] focus:ring-[#FF884D] outline-none transition-all placeholder-gray-300 text-sm font-medium"
                                placeholder="usuario@bencen.com"
                                required
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-bold text-neutral-700 ml-1">Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <svg className="h-5 w-5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 focus:border-[#FF884D] focus:ring-[#FF884D] outline-none transition-all placeholder-gray-300 text-sm font-medium tracking-wide"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg flex items-center gap-2">
                            <span className="block h-1.5 w-1.5 rounded-full bg-red-600"></span>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 mt-6 bg-[#FF884D] hover:bg-[#ff7b38] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Ingresar"}
                    </button>

                    {/* Explicitly omitting registration link as requested */}
                </form>
            </div>

            <p className="fixed bottom-4 text-xs text-neutral-400 font-medium">Bencen Mobile v1.0</p>
        </div>
    );
}
