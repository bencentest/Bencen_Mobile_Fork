import React, { useEffect, useState } from 'react';
import { X, Calendar, User, FileText, Plus, Loader2 } from 'lucide-react';
import { api } from '../services/api';

export function HistoryModal({ item, onClose, onAddProgress }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadHistory();
    }, [item]);

    const loadHistory = async () => {
        try {
            const data = await api.getItemHistory(item.id);
            setHistory(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                    <div>
                        <h3 className="font-bold text-lg text-neutral-900">Historial de Avances</h3>
                        <p className="text-xs text-neutral-500 font-mono mt-0.5">{item.item}</p>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-500 hover:text-neutral-800 rounded-full hover:bg-neutral-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">

                    {/* Item Summary */}
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
                        <p className="text-sm font-medium text-neutral-800 leading-snug">{item.descripcion}</p>
                        <div className="flex justify-between items-end mt-2">
                            <span className="text-xs text-neutral-500">Total: {Number(item.cantidad).toLocaleString('es-AR')} {item.unidad}</span>
                            {/* Calculated Total Progress could go here */}
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="space-y-4">
                        {loading ? (
                            <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" /></div>
                        ) : history.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <p className="text-sm">No hay reportes cargados.</p>
                            </div>
                        ) : (
                            history.map((entry) => (
                                <div key={entry.id} className="relative pl-4 border-l-2 border-orange-100 pb-2 last:pb-0">
                                    <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-orange-400 border-2 border-white"></div>

                                    <div className="bg-gray-50 rounded-lg p-3 ml-2 border border-gray-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-700">
                                                <Calendar className="w-3.5 h-3.5 text-orange-500" />
                                                {new Date(entry.fecha).toLocaleDateString('es-AR')}
                                            </div>
                                            <div className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                {entry.avance}%
                                            </div>
                                        </div>

                                        <p className="text-sm text-neutral-600 mb-2 italic">
                                            "{entry.observaciones}"
                                        </p>

                                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 border-t border-gray-100 pt-2">
                                            <User className="w-3.5 h-3.5" />
                                            {entry.mobile_users?.name || entry.mobile_users?.email || 'Usuario Desconocido'}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Footer Action */}
                <div className="p-4 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={onAddProgress}
                        className="w-full h-12 bg-neutral-900 hover:bg-black text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Avance
                    </button>
                </div>
            </div>
        </div>
    );
}
