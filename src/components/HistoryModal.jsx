import React, { useEffect, useState } from 'react';
import { X, Calendar, User, FileText, Plus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import { api } from '../services/api';
import { ProgressModal } from './ProgressModal';

export function HistoryModal({ item, onClose, onAddProgress, onUpdate }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [estimatedByDate, setEstimatedByDate] = useState({}); // iso date -> cumulative estimated %
    const [plannedWindow, setPlannedWindow] = useState(null); // { startDate, endDate }
    const [editingEntry, setEditingEntry] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [deletingEntry, setDeletingEntry] = useState(null);
    const [viewingImage, setViewingImage] = useState(null);

    const existingRange = (() => {
        const entries = (history || []).filter(h => h?.fecha_inicio && h?.fecha_fin);
        if (entries.length === 0) return null;
        const minStart = entries.reduce((min, h) => (h.fecha_inicio < min ? h.fecha_inicio : min), entries[0].fecha_inicio);
        const maxEnd = entries.reduce((max, h) => (h.fecha_fin > max ? h.fecha_fin : max), entries[0].fecha_fin);
        return { minStart, maxEnd };
    })();

    useEffect(() => {
        loadHistory();
    }, [item]);

    const loadHistory = async () => {
        try {
            const data = await api.getItemHistory(item.id);
            setHistory(data);

            // Estimated curve for the same date points shown in the chart.
            // Uses period-based avance_estimado from datos_licitaciones_avances.
            const licId = item?.id_licitacion;
            if (licId) {
                // Chart X-axis is "fecha de avance" (fecha_fin/fecha), so estimado is mapped to that same date.
                const dates = (data || [])
                    .map(h => String(h?.fecha_fin || h?.fecha || '').slice(0, 10))
                    .filter(Boolean);
                const map = await api.getItemEstimatedTimeline({
                    licitacionId: licId,
                    itemId: item.id,
                    dates
                });
                setEstimatedByDate(map || {});

                const pw = await api.getPlannedWindowByEstimado({ licitacionId: licId, itemIds: [item.id] });
                setPlannedWindow(pw || null);
            } else {
                setEstimatedByDate({});
                setPlannedWindow(null);
            }
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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] relative">
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
                            const totalQty = Number(item?.cantidad) || 0;
                            const unit = item?.unidad || '';

                            const fmtDate = (iso) => {
                                if (!iso) return '-';
                                try { return new Date(iso).toLocaleDateString('es-AR'); } catch { return String(iso); }
                            };

                            const fmtDateTime = (iso) => {
                                if (!iso) return '-';
                                try {
                                    return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                } catch {
                                    return String(iso);
                                }
                            };

                            // Calculate cumulative progress sorted by "fecha de avance" (fecha_fin/fecha)
                            const sortedHistory = [...history].sort((a, b) => new Date(a.fecha_fin || a.fecha) - new Date(b.fecha_fin || b.fecha));

                            let runningTotal = 0;

                            const points = sortedHistory.map((h) => {
                                runningTotal += h.avance;
                                const registroIso = h.created_at;         // fecha de registro
                                const avanceIso = h.fecha_fin || h.fecha; // fecha de avance (segun el parte)
                                const avanceDate = String(avanceIso || '').slice(0, 10);
                                const est = avanceDate ? (Number(estimatedByDate?.[String(avanceDate)]) || 0) : 0;
                                const deltaQty = totalQty > 0 ? (totalQty * (Number(h.avance) || 0) / 100) : null;
                                const x = avanceIso ? new Date(avanceIso).getTime() : null;

                                return {
                                    x,
                                    xKey: h.id, // Use unique ID to prevent X-axis merging
                                    date: fmtDate(avanceIso),
                                    fullDate: fmtDate(avanceIso),
                                    value: runningTotal,
                                    estimado: est,
                                    avance: h.avance,
                                    obs: h.observaciones,
                                    registroIso,
                                    registroFullDate: fmtDateTime(registroIso),
                                    avanceIso,
                                    periodoDesde: h.fecha_inicio || null,
                                    periodoHasta: h.fecha_fin || null,
                                    deltaQty,
                                    unit
                                };
                            }).filter(p => Number.isFinite(p.x));

                            const plannedStart = plannedWindow?.startDate ? new Date(plannedWindow.startDate).getTime() : null;
                            const plannedEnd = plannedWindow?.endDate ? new Date(plannedWindow.endDate).getTime() : null;

                            const xValues = points.map(d => d.x);
                            const xMinData = xValues.length ? Math.min(...xValues) : Date.now();
                            const xMaxData = xValues.length ? Math.max(...xValues) : Date.now();

                            // Avoid extreme zoom-out when there are outlier dates: keep the visible window near the planned range.
                            // Outliers are clamped to the edge (tooltip still shows the true dates).
                            const dayMs = 24 * 60 * 60 * 1000;
                            const extraDays = 45; // visible padding around the planned window
                            const maxSpanDays = 210; // if data span exceeds this, we clamp

                            const baseMin = plannedStart ?? xMinData;
                            const baseMax = plannedEnd ?? xMaxData;

                            const spanDays = (xMaxData - xMinData) / dayMs;
                            const shouldClamp = plannedStart && plannedEnd && spanDays > maxSpanDays;

                            const visibleMin = shouldClamp ? (plannedStart - extraDays * dayMs) : Math.min(xMinData, baseMin);
                            const visibleMax = shouldClamp ? (plannedEnd + extraDays * dayMs) : Math.max(xMaxData, baseMax);

                            const clampX = (x) => Math.min(visibleMax, Math.max(visibleMin, x));

                            // Add an initial point at 0 to show the climb from the start of the visible window.
                            const chartPoints = points.map(p => ({
                                ...p,
                                x_plot: clampX(p.x),
                                isOutlierLeft: p.x < visibleMin,
                                isOutlierRight: p.x > visibleMax,
                                // Estimado should only be drawn inside the planned window.
                                estimado_plot: (plannedStart && plannedEnd && p.x >= plannedStart && p.x <= plannedEnd) ? p.estimado : null
                            }));

                            const chartData = chartPoints.length > 0 ? [
                                { x: visibleMin, x_plot: visibleMin, xKey: 'start', date: 'Inicio', value: 0, estimado: 0, estimado_plot: null, avance: 0, fullDate: 'Inicio', obs: 'Inicio', deltaQty: null, unit },
                                ...chartPoints
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
                            const isComplete = totalProgress >= 99.9;

                            const CustomTooltip = ({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    const p = payload[0].payload;
                                    const realPoint = payload.find(x => x.dataKey === 'value')?.value;
                                    const estPoint = payload.find(x => x.dataKey === 'estimado_plot' || x.dataKey === 'estimado')?.value;
                                    return (
                                        <div className="bg-neutral-900 text-white text-xs rounded-lg p-2 shadow-xl border border-neutral-800">
                                            <p className="font-bold mb-1">{p.fullDate || p.date}</p>

                                            <p className="text-neutral-200">
                                                Avance cargado: <span className="font-bold text-white">+{p.avance}%</span>
                                                {p.deltaQty !== null ? ` (${Number(p.deltaQty).toLocaleString('es-AR')} ${p.unit})` : ''}
                                            </p>
                                            {estPoint !== undefined && (
                                                <p className="text-amber-300 font-bold mt-1">Estimado acumulado: {Number(estPoint).toFixed(2)}%</p>
                                            )}
                                            {realPoint !== undefined && (
                                                <p className="text-green-400 font-bold">Real acumulado: {Number(realPoint).toFixed(2)}%</p>
                                            )}
                                            {p.registroFullDate && p.registroFullDate !== '-' && (
                                                <p className="text-neutral-500 mt-1">Registrado: {p.registroFullDate}</p>
                                            )}
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
                                    {plannedWindow?.startDate && plannedWindow?.endDate && (
                                        <div className="text-[11px] text-neutral-500 -mt-2 mb-3">
                                            Periodo estimado: <span className="font-semibold text-neutral-700">{fmtDate(plannedWindow.startDate)} - {fmtDate(plannedWindow.endDate)}</span>
                                        </div>
                                    )}

                                    {/* Recharts Area Chart */}
                                    <div className="h-40 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 24, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2} />
                                                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                <XAxis
                                                    dataKey="x_plot"
                                                    type="number"
                                                    scale="time"
                                                    domain={[visibleMin, visibleMax]}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 10, fill: '#a3a3a3' }}
                                                    interval="preserveStartEnd"
                                                    padding={{ left: 12, right: 12 }}
                                                    tickFormatter={(val) => {
                                                        try {
                                                            return new Date(val).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                                                        } catch {
                                                            return '';
                                                        }
                                                    }}
                                                />
                                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 4' }} />

                                                {/* Planned window markers (estimado) */}
                                                {plannedStart && plannedEnd && (
                                                    <>
                                                        <ReferenceArea x1={plannedStart} x2={plannedEnd} fill="#93c5fd" fillOpacity={0.10} />
                                                        <ReferenceLine
                                                            x={plannedStart}
                                                            stroke="#60a5fa"
                                                            strokeDasharray="4 4"
                                                            label={{ value: fmtDate(plannedWindow.startDate), position: 'insideBottomLeft', fill: '#60a5fa', fontSize: 10 }}
                                                        />
                                                        <ReferenceLine
                                                            x={plannedEnd}
                                                            stroke="#60a5fa"
                                                            strokeDasharray="4 4"
                                                            label={{ value: fmtDate(plannedWindow.endDate), position: 'insideBottomRight', fill: '#60a5fa', fontSize: 10 }}
                                                        />
                                                        {/* Before/After plan shading */}
                                                        <ReferenceArea x1={visibleMin} x2={plannedStart} fill="#fca5a5" fillOpacity={0.06} />
                                                        <ReferenceArea x1={plannedEnd} x2={visibleMax} fill="#c4b5fd" fillOpacity={0.06} />
                                                    </>
                                                )}

                                                <Area
                                                    type="monotone"
                                                    dataKey="value"
                                                    stroke="var(--accent)"
                                                    strokeWidth={3}
                                                    fillOpacity={1}
                                                    fill="url(#colorGradient)"
                                                    activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent)' }}
                                                    dot={(props) => {
                                                        const x = props?.payload?.x;
                                                        const before = plannedStart && x < plannedStart;
                                                        const after = plannedEnd && x > plannedEnd;
                                                        const fill = before ? '#ef4444' : after ? '#8b5cf6' : 'var(--accent)';
                                                        return <circle cx={props.cx} cy={props.cy} r={3} fill={fill} stroke="#fff" strokeWidth={1} />;
                                                    }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="estimado_plot"
                                                    stroke="#f59e0b"
                                                    strokeWidth={2}
                                                    dot={false}
                                                    strokeDasharray="0"
                                                    isAnimationActive={false}
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
                            history.map((entry) => {
                                const totalQty = Number(item?.cantidad) || 0;
                                const unit = item?.unidad || '';
                                const deltaQty = totalQty > 0 ? (totalQty * (Number(entry.avance) || 0) / 100) : null;

                                const fmtDate = (iso) => {
                                    if (!iso) return '-';
                                    try { return new Date(iso).toLocaleDateString('es-AR'); } catch { return String(iso); }
                                };

                                const fmtDateTime = (iso) => {
                                    if (!iso) return '-';
                                    try {
                                        return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                                    } catch {
                                        return String(iso);
                                    }
                                };

                                return (
                                    <div key={entry.id} className="relative pl-4 border-l-2 border-orange-100 pb-4 last:pb-0 group">
                                        <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-orange-400 border-2 border-white"></div>

                                        <div className="bg-gray-50 rounded-lg p-3 ml-2 border border-gray-100 hover:border-orange-200 transition-colors">
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                {/* Left: requested literal fields */}
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 text-sm font-black text-neutral-900 truncate">
                                                        <Calendar className="w-4 h-4 text-orange-500 shrink-0" />
                                                        <span className="truncate">
                                                            Fecha/rango de avance:{' '}
                                                            <span className="font-black">
                                                                {fmtDate(entry.fecha_fin || entry.fecha)}
                                                            </span>
                                                            <span className="text-neutral-500 font-semibold">
                                                                {' '}({fmtDate(entry.fecha_inicio)} - {fmtDate(entry.fecha_fin)})
                                                            </span>
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-neutral-600 truncate mt-1">
                                                        Periodo del item:{' '}
                                                        <span className="font-semibold text-neutral-800">
                                                            {existingRange?.minStart ? fmtDate(existingRange.minStart) : '-'} - {existingRange?.maxEnd ? fmtDate(existingRange.maxEnd) : '-'}
                                                        </span>
                                                    </div>
                                                    <div className="text-[10px] text-neutral-400 truncate mt-1">
                                                        Ingresado: {fmtDateTime(entry.created_at)}
                                                    </div>
                                                </div>

                                                {/* Right: big advance values (qty + %) */}
                                                <div className="shrink-0 flex items-start gap-2">
                                                    <div className="text-right">
                                                        {deltaQty !== null ? (
                                                            <div className="text-sm font-black text-neutral-900 leading-none">
                                                                {Number(deltaQty).toLocaleString('es-AR')} <span className="text-xs text-neutral-500 font-bold">{unit}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm font-black text-neutral-900 leading-none">-</div>
                                                        )}
                                                        <div className="text-xs font-black text-green-700 mt-1">
                                                            {Number(entry.avance).toFixed(2)}%
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1">
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

                                        {/* Photos */}
                                        {entry.photos && entry.photos.length > 0 && (
                                            <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide">
                                                {entry.photos.map((url, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => setViewingImage(url)}
                                                        className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-orange-400 transition-colors"
                                                    >
                                                        <img src={url} alt="evidencia" className="w-full h-full object-cover" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-1.5 text-xs text-neutral-400 border-t border-gray-100 pt-2">
                                            <User className="w-3.5 h-3.5" />
                                            {entry.mobile_users?.name || entry.mobile_users?.email || 'Usuario Desconocido'}
                                        </div>
                                    </div>
                                </div>
                                );
                            })
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

                {/* LIGHTBOX */}
                {viewingImage && (
                    <div
                        className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
                        onClick={() => setViewingImage(null)}
                    >
                        <button className="absolute top-4 right-4 p-2 text-white/50 hover:text-white transition-colors">
                            <X className="w-8 h-8" />
                        </button>
                        <img
                            src={viewingImage}
                            alt="Full size"
                            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                )}
            </div>

            {/* Modal for Editing or Creating Strategy */}
            {(editingEntry || isAdding) && (
                <ProgressModal
                    item={item}
                    existingRange={existingRange}
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
