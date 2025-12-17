import React, { useEffect, useState } from 'react';
import { X, Calendar, User, FileText, Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../services/api';
import { ProgressModal } from './ProgressModal';

export function HistoryModal({ item, onClose, onAddProgress, onUpdate }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingEntry, setEditingEntry] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [deletingEntry, setDeletingEntry] = useState(null);

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

    const handleDeleteClick = (entry) => {
        setDeletingEntry(entry);
    };

    const confirmDelete = async () => {
        if (!deletingEntry) return;
        try {
            await api.deleteProgress(deletingEntry.id);
            loadHistory();
            if (onUpdate) onUpdate(); // Refresh parent dots
            setDeletingEntry(null);
        } catch (err) {
            console.error(err);
            alert("Error al eliminar.");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] relative">
                {/* Header - Fixed & Sticky */}
                <div className="flex items-start justify-between p-4 border-b border-gray-100 bg-white z-10">
                    <div className='pr-2 w-full'>
                        <h3 className="font-bold text-neutral-900 text-lg leading-tight mb-1">{item.descripcion}</h3>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-[var(--accent)]">{item.item}</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 font-medium">
                                {Number(item.cantidad).toLocaleString('es-AR')} {item.unidad}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-500 hover:text-neutral-800 rounded-full hover:bg-neutral-100 shrink-0">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">

                    {/* Progress Chart Section */}
                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                        {(() => {
                            // Calculate cumulative progress sorted by date
                            const sortedHistory = [...history].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

                            let runningTotal = 0;
                            // Add an initial point at 0 if there's history, to show the climb
                            const chartData = sortedHistory.length > 0 ? [
                                { date: 'Inicio', value: 0, avance: 0, fullDate: '', obs: 'Inicio' },
                                ...sortedHistory.map(h => {
                                    runningTotal += h.avance;
                                    return {
                                        date: new Date(h.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
                                        fullDate: new Date(h.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }),
                                        value: runningTotal,
                                        avance: h.avance,
                                        obs: h.observaciones
                                    };
                                })
                            ] : [];

                            // If no history, we might want to show empty state or 0
                            if (chartData.length === 0) {
                                return (
                                    <div className="flex items-baseline justify-between mb-2">
                                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Avance Total</span>
                                        <span className="text-2xl font-black text-neutral-900">0.00%</span>
                                    </div>
                                )
                            }

                            const totalProgress = runningTotal;
                            const isComplete = totalProgress >= 100;

                            const CustomTooltip = ({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="bg-neutral-900 text-white text-xs rounded-lg p-2 shadow-xl border border-neutral-800">
                                            <p className="font-bold mb-1">{payload[0].payload.fullDate || label}</p>
                                            <p className="text-green-400 font-bold">Total: {payload[0].value.toFixed(2)}%</p>
                                            <p className="text-neutral-400">Avance: +{payload[0].payload.avance}%</p>
                                        </div>
                                    );
                                }
                                return null;
                            };

                            return (
                                <div className="pt-2 border-t border-gray-100">
                                    <div className="flex items-baseline justify-between mb-4">
                                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Avance Total</span>
                                        <span className={`text-4xl font-black ${isComplete ? 'text-green-600' : 'text-neutral-900'}`}>
                                            {totalProgress.toFixed(2)}<span className="text-lg text-neutral-400 ml-1">%</span>
                                        </span>
                                    </div>

                                    {/* Recharts Area Chart */}
                                    <div className="h-40 w-full -ml-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                <XAxis
                                                    dataKey="date"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 10, fill: '#a3a3a3' }}
                                                    interval="preserveStartEnd"
                                                />
                                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                                <Area
                                                    type="monotone"
                                                    dataKey="value"
                                                    stroke="var(--accent)"
                                                    strokeWidth={3}
                                                    fillOpacity={1}
                                                    fill="url(#colorGradient)"
                                                    activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent)' }}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            );
                        })()}
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
                                <div key={entry.id} className="relative pl-4 border-l-2 border-orange-100 pb-4 last:pb-0 group">
                                    <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-orange-400 border-2 border-white"></div>

                                    <div className="bg-gray-50 rounded-lg p-3 ml-2 border border-gray-100 hover:border-orange-200 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-700">
                                                <Calendar className="w-3.5 h-3.5 text-orange-500" />
                                                {new Date(entry.fecha).toLocaleDateString('es-AR')}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                                    {entry.avance}%
                                                </div>
                                                {/* Actions */}
                                                <div className="flex items-center gap-1 transition-opacity">
                                                    <button onClick={() => setEditingEntry(entry)} className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDeleteClick(entry)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
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
                        onClick={() => setIsAdding(true)}
                        className="w-full h-12 bg-neutral-900 hover:bg-black text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Avance
                    </button>
                </div>

                {/* DELETE CONFIRMATION OVERLAY */}
                {deletingEntry && (
                    <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-200">
                        <div className="bg-red-100 p-4 rounded-full mb-4">
                            <Trash2 className="w-8 h-8 text-red-600" />
                        </div>
                        <h4 className="text-lg font-bold text-neutral-900 mb-2">¿Eliminar este avance?</h4>
                        <p className="text-sm text-neutral-500 mb-8">
                            Se eliminará el registro del {new Date(deletingEntry.fecha).toLocaleDateString()} ({deletingEntry.avance}%) de forma permanente.
                        </p>
                        <div className="flex flex-col w-full gap-3">
                            <button
                                onClick={confirmDelete}
                                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all"
                            >
                                Sí, Eliminar
                            </button>
                            <button
                                onClick={() => setDeletingEntry(null)}
                                className="w-full h-12 bg-gray-100 hover:bg-gray-200 text-neutral-700 font-bold rounded-xl active:scale-[0.98] transition-all"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal for Editing or Creating Strategy */}
            {(editingEntry || isAdding) && (
                <ProgressModal
                    item={item}
                    editingEntry={editingEntry}
                    onClose={() => {
                        setEditingEntry(null);
                        setIsAdding(false);
                    }}
                    onSuccess={() => {
                        loadHistory();
                        if (onUpdate) onUpdate();
                        setEditingEntry(null);
                        setIsAdding(false);
                    }}
                />
            )}
        </div>
    );
}
