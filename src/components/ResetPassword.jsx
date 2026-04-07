import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useResetPassword } from '../features/auth/useResetPassword';
import { supabase } from '../services/supabase';

export function ResetPassword({ onBackToLogin }) {
    const {
        password,
        setPassword,
        confirmPassword,
        setConfirmPassword,
        loading,
        verifying,
        error,
        success,
        handleSubmit,
    } = useResetPassword(async () => {
        await supabase.auth.signOut();
        if (onBackToLogin) onBackToLogin();
    });

    if (verifying) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#FDF8F5] p-4 text-neutral-800">
                <div className="text-center">
                    <Loader2 className="w-10 h-10 animate-spin text-[#FF884D] mx-auto mb-4" />
                    <p className="text-neutral-500 font-medium">Verificando enlace de recuperacion...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#FDF8F5] p-4 text-neutral-800">
            <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-xl p-8">
                <div className="text-center mb-8">
                    <img src="/bencen-logo.png" alt="Bencen" className="h-10 mx-auto mb-6" />
                    <h2 className="text-2xl font-bold mb-2 tracking-tight">Nueva contraseña</h2>
                    <p className="text-neutral-500 text-sm">Crea una nueva contraseña segura para tu cuenta.</p>
                </div>

                {success ? (
                    <div className="text-center py-4">
                        <div className="flex justify-center mb-4">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900 mb-2">¡Contraseña actualizada!</h3>
                        <p className="text-sm text-neutral-500 mb-6">Tu contraseña fue cambiada con éxito. Volviendo al login...</p>
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {!error && (
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="block text-sm font-bold text-neutral-700 ml-1">Nueva contraseña</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3.5 h-5 w-5 text-neutral-400" />
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(event) => setPassword(event.target.value)}
                                            className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 focus:border-[#FF884D] focus:ring-[#FF884D] outline-none transition-all placeholder-gray-300 text-sm font-medium tracking-wide"
                                            placeholder="********"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-sm font-bold text-neutral-700 ml-1">Confirmar contraseña</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3.5 h-5 w-5 text-neutral-400" />
                                        <input
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                            className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 focus:border-[#FF884D] focus:ring-[#FF884D] outline-none transition-all placeholder-gray-300 text-sm font-medium tracking-wide"
                                            placeholder="********"
                                            required
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-12 mt-6 bg-[#FF884D] hover:bg-[#ff7b38] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Actualizar contraseña'}
                                </button>
                            </form>
                        )}

                        {error && (
                            <div className="mt-4 text-center">
                                <button onClick={onBackToLogin} className="text-xs font-semibold text-[#FF884D] hover:underline">
                                    Volver al inicio de sesión y solicitar un nuevo enlace
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
