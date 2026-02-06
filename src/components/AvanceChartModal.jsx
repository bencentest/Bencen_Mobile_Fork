import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, ReferenceLine } from 'recharts';
import { api } from '../services/api';

function isoToday() {
    return new Date().toISOString().split('T')[0];
}

function isoDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

export function AvanceChartModal({
    licitacionId,
    itemIds,
    weightsByItemId = null,
    qtyByItemId = null,
    unitByItemId = null,
    title = 'Avance (Estimado vs Real)',
    subtitle = '',
    onClose
}) {
    const [preset, setPreset] = useState('month'); // day | week | fortnight | month | custom | all
    const [startDate, setStartDate] = useState(isoDaysAgo(30));
    const [endDate, setEndDate] = useState(isoToday());
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState([]);
    const [error, setError] = useState(null);
    const didInitRangeRef = useRef(false);
    const [viewMode, setViewMode] = useState('pct'); // pct | qty

    // Default range: from the min/max period that exists in datos_licitaciones_avances for these item(s).
    useEffect(() => {
        let cancelled = false;

        async function initRange() {
            if (!licitacionId || !Array.isArray(itemIds) || itemIds.length === 0) return;
            if (didInitRangeRef.current) return;

            const range = await api.getAvanceDefaultDateRange({ licitacionId, itemIds });
            if (cancelled) return;
            if (!range?.startDate || !range?.endDate) return;

            didInitRangeRef.current = true;
            setPreset('custom');
            setStartDate(range.startDate);
            setEndDate(range.endDate);
        }

        initRange();
        return () => { cancelled = true; };
    }, [licitacionId, itemIds]);

    useEffect(() => {
        if (preset === 'all') return;
        if (preset === 'custom') return;

        const end = isoToday();
        const start =
            preset === 'day' ? isoDaysAgo(1) :
                preset === 'week' ? isoDaysAgo(7) :
                    preset === 'fortnight' ? isoDaysAgo(15) :
                        isoDaysAgo(30);

        setStartDate(start);
        setEndDate(end);
    }, [preset]);

    const effectiveRange = useMemo(() => {
        if (preset === 'all') return { start: null, end: null };
        return { start: startDate || null, end: endDate || null };
    }, [preset, startDate, endDate]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const series = await api.getAvanceEstimadoRealSeries({
                    licitacionId,
                    itemIds,
                    startDate: effectiveRange.start,
                    endDate: effectiveRange.end,
                    weightsByItemId,
                    qtyByItemId,
                    unitByItemId
                });

                if (!cancelled) setData(series);
            } catch (e) {
                console.error(e);
                if (!cancelled) setError(e?.message || 'Error cargando gráfico.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        if (!licitacionId || !Array.isArray(itemIds) || itemIds.length === 0) {
            setData([]);
            setLoading(false);
            return;
        }

        load();
        return () => { cancelled = true; };
    }, [licitacionId, itemIds, effectiveRange.start, effectiveRange.end, weightsByItemId]);

    const yDomain = useMemo(() => {
        // keep 0..100 but allow overshoot by rounding errors
        if (viewMode === 'qty') return [0, 'auto'];
        return [0, 110];
    }, [viewMode]);

    const qtyAvailable = useMemo(() => {
        return data.some(r => r?.real_qty !== null && r?.estimado_qty !== null && r?.unidad);
    }, [data]);

    // If qty is not available for this chart (mixed units), force pct.
    useEffect(() => {
        if (viewMode === 'qty' && !qtyAvailable) setViewMode('pct');
    }, [viewMode, qtyAvailable]);

    const unidad = useMemo(() => {
        const u = data.find(r => r?.unidad)?.unidad;
        return u ? String(u) : '';
    }, [data]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload || payload.length === 0) return null;
        const p = payload[0]?.payload;
        if (!p) return null;

        const isQty = viewMode === 'qty';
        const realCum = isQty ? p.real_qty : p.real;
        const estCum = isQty ? p.estimado_qty : p.estimado;
        const realDelta = isQty ? null : p.real_periodo;
        const estDelta = isQty ? null : p.estimado_periodo;

        return (
            <div className="bg-neutral-900 text-white text-xs rounded-lg p-2 shadow-xl border border-neutral-800">
                <p className="font-bold mb-1">{label}</p>
                {!isQty && (
                    <p className="text-neutral-300">
                        Incremento del período: <span className="text-green-300 font-bold">Real +{Number(realDelta || 0).toFixed(2)}%</span>{' '}
                        <span className="text-amber-300 font-bold">Estimado +{Number(estDelta || 0).toFixed(2)}%</span>
                    </p>
                )}
                <p className="text-green-300 font-bold mt-1">
                    Real acumulado: {isQty ? `${Number(realCum || 0).toLocaleString('es-AR')} ${unidad}` : `${Number(realCum || 0).toFixed(2)}%`}
                </p>
                <p className="text-amber-300 font-bold">
                    Estimado acumulado: {isQty ? `${Number(estCum || 0).toLocaleString('es-AR')} ${unidad}` : `${Number(estCum || 0).toFixed(2)}%`}
                </p>
            </div>
        );
    };

    const planned = useMemo(() => {
        if (!data || data.length === 0) return null;
        const startIdx = data.findIndex(d => Number(d?.estimado_periodo) > 0);
        if (startIdx === -1) return null;
        let endIdx = -1;
        for (let i = data.length - 1; i >= 0; i--) {
            if (Number(data[i]?.estimado_periodo) > 0) { endIdx = i; break; }
        }
        if (endIdx === -1) return null;

        const startDate = data[startIdx]?.fecha_desde || data[startIdx]?.fecha_hasta || null;
        const endDate = data[endIdx]?.fecha_hasta || data[endIdx]?.fecha_desde || null;
        return {
            startLabel: data[startIdx]?.label,
            endLabel: data[endIdx]?.label,
            startDate,
            endDate,
            endIdx
        };
    }, [data]);

    const displayData = useMemo(() => {
        if (!data || data.length === 0) return [];
        if (!planned?.endIdx && planned?.endIdx !== 0) return data;

        // Stop drawing estimated curve after the planned end.
        return data.map((d, idx) => ({
            ...d,
            estimado_plot: idx <= planned.endIdx ? (viewMode === 'qty' ? d.estimado_qty : d.estimado) : null,
            real_plot: viewMode === 'qty' ? d.real_qty : d.real
        }));
    }, [data, planned, viewMode]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-start justify-between p-4 border-b border-gray-100">
                    <div className="pr-2">
                        <h3 className="font-bold text-neutral-900 text-lg leading-tight">{title}</h3>
                        {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-500 hover:text-neutral-800 rounded-full hover:bg-neutral-100 shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 border-b border-gray-100 bg-gray-50">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                            <label className="block text-xs font-bold text-neutral-600 mb-1">Rango</label>
                            <select
                                value={preset}
                                onChange={(e) => setPreset(e.target.value)}
                                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white"
                            >
                                <option value="day">Día</option>
                                <option value="week">Semana</option>
                                <option value="fortnight">Quincena</option>
                                <option value="month">Mes</option>
                                <option value="custom">Personalizado</option>
                                <option value="all">Todo</option>
                            </select>
                        </div>

                        <div className="sm:col-span-2 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-neutral-600">Vista</span>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('pct')}
                                    className={`h-9 px-3 rounded-lg border text-sm font-semibold ${viewMode === 'pct' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-gray-300'}`}
                                >
                                    %
                                </button>
                                <button
                                    type="button"
                                    disabled={!qtyAvailable}
                                    onClick={() => setViewMode('qty')}
                                    className={`h-9 px-3 rounded-lg border text-sm font-semibold ${viewMode === 'qty' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-gray-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    title={qtyAvailable ? `Ver en cantidad (${unidad})` : 'No disponible (unidades mezcladas o faltan cantidades)'}
                                >
                                    Cantidad
                                </button>
                            </div>
                            {viewMode === 'qty' && unidad && (
                                <span className="text-xs text-neutral-500">Unidad: {unidad}</span>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-neutral-600 mb-1">Desde</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => { setPreset('custom'); setStartDate(e.target.value); }}
                                disabled={preset === 'all'}
                                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white disabled:bg-gray-100"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-neutral-600 mb-1">Hasta</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => { setPreset('custom'); setEndDate(e.target.value); }}
                                disabled={preset === 'all'}
                                className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white disabled:bg-gray-100"
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 flex-1 overflow-hidden">
                    {loading ? (
                        <div className="h-full flex items-center justify-center text-neutral-500">
                            <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            Cargando...
                        </div>
                    ) : error ? (
                        <div className="h-full flex items-center justify-center text-red-600 text-sm">
                            {error}
                        </div>
                    ) : data.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
                            Sin datos en el rango seleccionado.
                        </div>
                    ) : (
                        <div className="w-full h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={displayData} margin={{ top: 10, right: 20, left: 24, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" padding={{ left: 12, right: 12 }} />
                                    <YAxis
                                        domain={yDomain}
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={(v) => viewMode === 'qty' ? `${Number(v).toLocaleString('es-AR')}` : `${Math.round(v)}%`}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />

                                    {/* Planned window markers (estimado > 0) */}
                                    {planned?.startLabel && planned?.endLabel && (
                                        <>
                                            <ReferenceArea x1={planned.startLabel} x2={planned.endLabel} fill="#93c5fd" fillOpacity={0.10} />
                                            <ReferenceLine
                                                x={planned.startLabel}
                                                stroke="#60a5fa"
                                                strokeDasharray="4 4"
                                                label={{ value: planned.startDate || planned.startLabel, position: 'insideBottomLeft', fill: '#60a5fa', fontSize: 10 }}
                                            />
                                            <ReferenceLine
                                                x={planned.endLabel}
                                                stroke="#60a5fa"
                                                strokeDasharray="4 4"
                                                label={{ value: planned.endDate || planned.endLabel, position: 'insideBottomRight', fill: '#60a5fa', fontSize: 10 }}
                                            />
                                        </>
                                    )}

                                    <Line
                                        type="monotone"
                                        dataKey="estimado_plot"
                                        name="Estimado"
                                        stroke="#f59e0b"
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="real_plot"
                                        name="Real"
                                        stroke="#22c55e"
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
