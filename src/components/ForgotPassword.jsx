import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { supabase } from '../services/supabase';

export function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (resetError) setError(resetError.message || 'Error al enviar el correo de recuperacion.');
            else setSuccess(true);
        } catch (_error) {
            setError('Ocurrio un error inesperado.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#FDF8F5] p-4 text-neutral-800">
            <div className="w-full max-w-[400px] bg-white rounded-3xl shadow-xl p-8">
                <div className="text-center mb-8">
                    <img src="/bencen-logo.png" alt="Bencen" className="h-10 mx-auto mb-6" />
                    <h2 className="text-2xl font-bold mb-2 tracking-tight">Recuperar contraseña</h2>
                    <p className="text-neutral-500 text-sm">Te enviaremos un enlace para restablecer el acceso.</p>
                </div>

                {success ? (
                    <div className="text-center py-4">
                        <div className="flex justify-center mb-4">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                            </div>
                        </div>
                        <h3 className="text-lg font-medium text-neutral-900 mb-2">Correo enviado</h3>
                        <p className="text-sm text-neutral-500 mb-6">Revisa tu casilla para continuar con la recuperacion.</p>
                        <a href="/" className="inline-flex items-center gap-1 text-sm font-bold text-[#FF884D] hover:underline">
                            <ArrowLeft className="w-4 h-4" /> Volver al inicio de sesión
                        </a>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="block text-sm font-bold text-neutral-700 ml-1">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3.5 h-5 w-5 text-neutral-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 focus:border-[#FF884D] focus:ring-[#FF884D] outline-none transition-all placeholder-gray-300 text-sm font-medium"
                                    placeholder="usuario@bencen.com"
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
                            className="w-full h-12 bg-[#FF884D] hover:bg-[#ff7b38] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar link de recuperacion'}
                        </button>

                        <div className="text-center">
                            <a href="/" className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 transition-colors">
                                <ArrowLeft className="w-3 h-3" /> Volver al inicio de sesión
                            </a>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
