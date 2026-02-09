import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    ReferenceArea,
    ReferenceLine
} from 'recharts';
import { api } from '../services/api';

const dayMs = 24 * 60 * 60 * 1000;

function fmtDate(iso) {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleDateString('es-AR'); } catch { return String(iso); }
}

function fmtDateTime(iso) {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return String(iso);
    }
}

function isoToday() {
    return new Date().toISOString().split('T')[0];
}

function isoDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}

function isoToMs(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms : null;
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
    const [planSeries, setPlanSeries] = useState([]);
    const [cargasSeries, setCargasSeries] = useState([]);
    const [error, setError] = useState(null);
    const didInitRangeRef = useRef(false);
    const [viewMode, setViewMode] = useState('pct'); // pct | qty
    const [plannedWindow, setPlannedWindow] = useState(null); // { startDate, endDate }
    const [zoomMode, setZoomMode] = useState('plan'); // plan | toReal

    const itemIdsKey = useMemo(() => (Array.isArray(itemIds) ? itemIds.map(String).join(',') : ''), [itemIds]);

    // Default range: prefer planned window (estimado > 0), fallback to min/max period range.
    useEffect(() => {
        let cancelled = false;

        async function init() {
            if (!licitacionId || !Array.isArray(itemIds) || itemIds.length === 0) {
                setPlannedWindow(null);
                return;
            }

            const pw = await api.getPlannedWindowByEstimado({ licitacionId, itemIds });
            if (cancelled) return;
            setPlannedWindow(pw || null);

            if (didInitRangeRef.current) return;

            if (pw?.startDate && pw?.endDate) {
                didInitRangeRef.current = true;
                setZoomMode('plan');
                setPreset('custom');
                setStartDate(pw.startDate);
                setEndDate(pw.endDate);
                return;
            }

            const range = await api.getAvanceDefaultDateRange({ licitacionId, itemIds });
            if (cancelled) return;
            if (range?.startDate && range?.endDate) {
                didInitRangeRef.current = true;
                setPreset('custom');
                setStartDate(range.startDate);
                setEndDate(range.endDate);
            }
        }

        init();
        return () => { cancelled = true; };
    }, [licitacionId, itemIds, itemIdsKey]);

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
                const [plan, cargas] = await Promise.all([
                    api.getAvanceEstimadoRealSeries({
                        licitacionId,
                        itemIds,
                        startDate: effectiveRange.start,
                        endDate: effectiveRange.end,
                        weightsByItemId,
                        qtyByItemId,
                        unitByItemId
                    }),
                    api.getAvanceCargasTimeline({
                        licitacionId,
                        itemIds,
                        startDate: effectiveRange.start,
                        endDate: effectiveRange.end,
                        weightsByItemId,
                        qtyByItemId,
                        unitByItemId
                    })
                ]);

                if (!cancelled) {
                    setPlanSeries(plan || []);
                    setCargasSeries(cargas || []);
                }
            } catch (e) {
                console.error(e);
                if (!cancelled) setError(e?.message || 'Error cargando gráfico.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        if (!licitacionId || !Array.isArray(itemIds) || itemIds.length === 0) {
            setPlanSeries([]);
            setCargasSeries([]);
            setLoading(false);
            return;
        }

        load();
        return () => { cancelled = true; };
    }, [licitacionId, itemIds, itemIdsKey, effectiveRange.start, effectiveRange.end, weightsByItemId, qtyByItemId, unitByItemId]);

    const yDomain = useMemo(() => {
        if (viewMode === 'qty') return [0, 'auto'];
        return [0, 110];
    }, [viewMode]);

    const qtyAvailable = useMemo(() => {
        return planSeries.some(r => r?.estimado_qty !== null && r?.unidad) && cargasSeries.some(r => r?.real_cum_qty !== null && r?.unidad);
    }, [planSeries, cargasSeries]);

    useEffect(() => {
        if (viewMode === 'qty' && !qtyAvailable) setViewMode('pct');
    }, [viewMode, qtyAvailable]);

    const unidad = useMemo(() => {
        const u = planSeries.find(r => r?.unidad)?.unidad || cargasSeries.find(r => r?.unidad)?.unidad;
        return u ? String(u) : '';
    }, [planSeries, cargasSeries]);

    const plannedStartMs = useMemo(() => isoToMs(plannedWindow?.startDate), [plannedWindow?.startDate]);
    const plannedEndMs = useMemo(() => isoToMs(plannedWindow?.endDate), [plannedWindow?.endDate]);

    const planPeriods = useMemo(() => {
        return (planSeries || [])
            .map(p => {
                const startIso = String(p?.fecha_desde || p?.fecha_hasta || '').slice(0, 10) || null;
                const endIso = String(p?.fecha_hasta || p?.fecha_desde || '').slice(0, 10) || null;
                return {
                    startIso,
                    endIso,
                    cumPct: Number(p?.estimado) || 0,
                    cumQty: p?.estimado_qty !== null && p?.estimado_qty !== undefined ? (Number(p.estimado_qty) || 0) : null
                };
            })
            .filter(p => p.startIso && p.endIso);
    }, [planSeries]);

    const pickEstimadoCumForIso = useMemo(() => {
        const periods = planPeriods;
        return (iso, mode) => {
            const d = String(iso || '').slice(0, 10);
            if (!d || periods.length === 0) return mode === 'qty' ? null : 0;

            let idxContain = -1;
            let idxLastEnded = -1;
            for (let i = 0; i < periods.length; i++) {
                const p = periods[i];
                if (p.endIso && p.endIso <= d) idxLastEnded = i;
                if (p.startIso && p.endIso && p.startIso <= d && d <= p.endIso) idxContain = i;
            }
            const idx = idxContain !== -1 ? idxContain : idxLastEnded;
            if (idx === -1) return mode === 'qty' ? null : 0;
            return mode === 'qty' ? periods[idx].cumQty : periods[idx].cumPct;
        };
    }, [planPeriods]);

    const estimatedPoints = useMemo(() => {
        const isQty = viewMode === 'qty';
        const pts = [];

        const startIso = plannedWindow?.startDate ? String(plannedWindow.startDate).slice(0, 10) : null;
        const endIso = plannedWindow?.endDate ? String(plannedWindow.endDate).slice(0, 10) : null;

        if (startIso) {
            const x = isoToMs(startIso);
            if (x !== null) pts.push({ x, kind: 'estimado', fullDate: fmtDate(startIso), estimado_plot: 0 });
        }

        (planSeries || []).forEach((p) => {
            const iso = String(p?.fecha_hasta || p?.fecha_desde || '').slice(0, 10) || null;
            const x = isoToMs(iso);
            if (!iso || x === null) return;
            const y = isQty ? p.estimado_qty : p.estimado;
            if (y === null || y === undefined) return;
            pts.push({ x, kind: 'estimado', fullDate: fmtDate(iso), estimado_plot: Number(y) || 0 });
        });

        if (endIso) {
            const x = isoToMs(endIso);
            if (x !== null && !pts.some(p => p.x === x)) {
                const y = pickEstimadoCumForIso(endIso, viewMode);
                if (y !== null && y !== undefined) {
                    pts.push({ x, kind: 'estimado', fullDate: fmtDate(endIso), estimado_plot: Number(y) || 0 });
                }
            }
        }

        pts.sort((a, b) => a.x - b.x);
        return pts;
    }, [planSeries, plannedWindow?.startDate, plannedWindow?.endDate, viewMode, pickEstimadoCumForIso]);

    const realPoints = useMemo(() => {
        const isQty = viewMode === 'qty';
        const pts = (cargasSeries || [])
            .map((r, idx) => {
                const iso = String(r?.avance_iso || '').slice(0, 10) || null;
                const baseX = isoToMs(iso);
                if (!iso || baseX === null) return null;

                const x = baseX + (idx * 0.0001);
                const realCum = isQty ? r.real_cum_qty : r.real_cum_pct;
                const carga = isQty ? r.real_delta_qty : r.real_delta_pct;
                const estCum = pickEstimadoCumForIso(iso, viewMode);
                const diff = (realCum !== null && realCum !== undefined && estCum !== null && estCum !== undefined)
                    ? (Number(realCum) - Number(estCum))
                    : null;

                return {
                    x,
                    kind: 'real',
                    fullDate: fmtDate(iso),
                    registroFullDate: fmtDateTime(r.created_at),
                    avance: Number(r.avance) || 0,
                    item_id: r.item_id,
                    real_plot: realCum !== null && realCum !== undefined ? (Number(realCum) || 0) : null,
                    carga_delta: carga !== null && carga !== undefined ? (Number(carga) || 0) : null,
                    estimado_at: estCum !== null && estCum !== undefined ? (Number(estCum) || 0) : null,
                    diff_vs_estimado: diff
                };
            })
            .filter(Boolean);

        // If there's only one (or few) real points, add a baseline at the start of the estimated plan
        // so the real line "starts" from the same origin as the estimated curve.
        if (pts.length > 0) {
            const firstRealX = pts[0].x;
            const estStartX = plannedStartMs ?? estimatedPoints?.[0]?.x ?? firstRealX;
            const baseX = Math.min(firstRealX, estStartX);

            if (!pts.some(p => p.x === baseX)) {
                const iso = new Date(baseX).toISOString().slice(0, 10);
                const estAt = pickEstimadoCumForIso(iso, viewMode);
                pts.unshift({
                    x: baseX,
                    kind: 'real',
                    fullDate: fmtDate(iso),
                    registroFullDate: '-',
                    avance: 0,
                    item_id: null,
                    real_plot: 0,
                    carga_delta: 0,
                    estimado_at: estAt !== null && estAt !== undefined ? (Number(estAt) || 0) : null,
                    diff_vs_estimado: estAt !== null && estAt !== undefined ? (0 - Number(estAt || 0)) : null
                });
            }
        }

        return pts;
    }, [cargasSeries, pickEstimadoCumForIso, viewMode, plannedStartMs, estimatedPoints]);

    const lastRealIso = useMemo(() => {
        const last = cargasSeries?.length ? cargasSeries[cargasSeries.length - 1] : null;
        const iso = last?.avance_iso ? String(last.avance_iso).slice(0, 10) : null;
        return iso || null;
    }, [cargasSeries]);

    const lastRealMs = useMemo(() => {
        return isoToMs(lastRealIso);
    }, [lastRealIso]);

    const displayEstimatedPoints = useMemo(() => {
        if (zoomMode !== 'toReal') return estimatedPoints;
        if (!Number.isFinite(lastRealMs) || !lastRealIso) return estimatedPoints;

        const out = (estimatedPoints || []).map(p => {
            if (!Number.isFinite(p?.x)) return p;
            if (p.x > lastRealMs) return { ...p, estimado_plot: null };
            return p;
        });

        const y = pickEstimadoCumForIso(lastRealIso, viewMode);
        if (y !== null && y !== undefined && !out.some(p => p?.x === lastRealMs)) {
            out.push({
                x: lastRealMs,
                kind: 'estimado',
                fullDate: fmtDate(lastRealIso),
                estimado_plot: Number(y) || 0
            });
        }

        out.sort((a, b) => (a.x - b.x) || (a.kind === 'estimado' ? -1 : 1));
        return out;
    }, [zoomMode, estimatedPoints, lastRealMs, lastRealIso, pickEstimadoCumForIso, viewMode]);

    const chartData = useMemo(() => {
        const all = [...(displayEstimatedPoints || []), ...(realPoints || [])];
        all.sort((a, b) => (a.x - b.x) || (a.kind === 'estimado' ? -1 : 1));
        return all;
    }, [displayEstimatedPoints, realPoints]);

    const visibleDomain = useMemo(() => {
        if (!chartData || chartData.length === 0) return null;
        const xs = chartData.map(d => d.x).filter(Number.isFinite);
        if (xs.length === 0) return null;

        const dataMin = Math.min(...xs);
        const dataMax = Math.max(...xs);

        const baseMin = plannedStartMs ?? dataMin;
        const baseMax = plannedEndMs ?? dataMax;

        // Keep the zoom tight when focusing "Hasta carga": show only from the plan start to the last real carga.
        const padPlan = 7 * dayMs;
        const padToReal = 1 * dayMs;
        if (zoomMode === 'toReal' && Number.isFinite(lastRealMs)) {
            const min = baseMin - padToReal;
            const max = Math.max(baseMin, lastRealMs) + padToReal;
            return [min, max];
        }

        return [baseMin - padPlan, baseMax + padPlan];
    }, [chartData, plannedStartMs, plannedEndMs, lastRealMs, zoomMode]);

    const CustomTooltip = ({ active, payload }) => {
        if (!active || !payload || payload.length === 0) return null;
        const p = payload[0]?.payload;
        if (!p) return null;

        const isQty = viewMode === 'qty';
        const unitLabel = isQty && unidad ? ` ${unidad}` : '';
        const isReal = p.kind === 'real';

        const estAt = isReal ? p.estimado_at : (p.estimado_plot ?? null);
        const realCum = isReal ? p.real_plot : null;
        const carga = isReal ? p.carga_delta : null;
        const diff = isReal ? p.diff_vs_estimado : null;

        return (
            <div className="bg-neutral-900 text-white text-xs rounded-lg p-2 shadow-xl border border-neutral-800">
                <p className="font-bold mb-1">{p.fullDate || '-'}</p>

                {isReal && (
                    <p className="text-neutral-200">
                        Carga:{' '}
                        <span className="font-bold text-white">
                            {isQty ? `${Number(carga || 0).toLocaleString('es-AR')}${unitLabel}` : `+${Number(carga || 0).toFixed(2)} pp`}
                        </span>{' '}
                        {!isQty && <span className="text-neutral-400">({Number(p.avance || 0).toFixed(2)}% del item)</span>}
                    </p>
                )}

                {estAt !== null && estAt !== undefined && (
                    <p className="text-amber-300 font-bold mt-1">
                        Estimado acumulado:{' '}
                        {isQty ? `${Number(estAt || 0).toLocaleString('es-AR')}${unitLabel}` : `${Number(estAt || 0).toFixed(2)}%`}
                    </p>
                )}

                {isReal && realCum !== null && realCum !== undefined && (
                    <p className="text-green-300 font-bold">
                        Real acumulado:{' '}
                        {isQty ? `${Number(realCum || 0).toLocaleString('es-AR')}${unitLabel}` : `${Number(realCum || 0).toFixed(2)}%`}
                    </p>
                )}

                {isReal && diff !== null && diff !== undefined && (
                    <p className={`font-bold ${Number(diff) >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                        Diferencia vs estimado:{' '}
                        {Number(diff) >= 0 ? '+' : ''}
                        {isQty ? `${Number(diff).toLocaleString('es-AR')}${unitLabel}` : `${Number(diff).toFixed(2)} pp`}
                    </p>
                )}

                {isReal && p.registroFullDate && p.registroFullDate !== '-' && (
                    <p className="text-neutral-500 mt-1">Registrado: {p.registroFullDate}</p>
                )}
            </div>
        );
    };

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

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setZoomMode('plan')}
                                    className={`h-9 px-3 rounded-lg border text-sm font-semibold ${zoomMode === 'plan' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-gray-300'}`}
                                    title="Ver todo el plan estimado"
                                >
                                    Plan
                                </button>
                                <button
                                    type="button"
                                    disabled={!Number.isFinite(lastRealMs)}
                                    onClick={() => setZoomMode('toReal')}
                                    className={`h-9 px-3 rounded-lg border text-sm font-semibold ${zoomMode === 'toReal' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-gray-300'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    title={Number.isFinite(lastRealMs) ? 'Zoom hasta la última carga' : 'No hay cargas para hacer zoom'}
                                >
                                    Hasta carga
                                </button>
                            </div>
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

                    {plannedWindow?.startDate && plannedWindow?.endDate && (
                        <div className="text-[11px] text-neutral-500 mt-2">
                            Periodo estimado: <span className="font-semibold text-neutral-700">{fmtDate(plannedWindow.startDate)} - {fmtDate(plannedWindow.endDate)}</span>
                        </div>
                    )}
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
                    ) : chartData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
                            Sin datos en el rango seleccionado.
                        </div>
                    ) : (
                        <div className="w-full h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 24, bottom: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis
                                        dataKey="x"
                                        type="number"
                                        domain={visibleDomain || ['auto', 'auto']}
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={(v) => {
                                            try { return new Date(v).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); } catch { return ''; }
                                        }}
                                    />
                                    <YAxis
                                        domain={yDomain}
                                        tick={{ fontSize: 11 }}
                                        tickFormatter={(v) => viewMode === 'qty' ? `${Number(v).toLocaleString('es-AR')}` : `${Math.round(v)}%`}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend />

                                    {plannedStartMs && (plannedEndMs || Number.isFinite(lastRealMs)) && (
                                        <>
                                            <ReferenceArea
                                                x1={plannedStartMs}
                                                x2={(zoomMode === 'toReal' && Number.isFinite(lastRealMs)) ? lastRealMs : plannedEndMs}
                                                fill="#93c5fd"
                                                fillOpacity={0.10}
                                            />
                                            <ReferenceLine
                                                x={plannedStartMs}
                                                stroke="#60a5fa"
                                                strokeDasharray="4 4"
                                                label={{ value: fmtDate(plannedWindow?.startDate), position: 'insideBottomLeft', fill: '#60a5fa', fontSize: 10 }}
                                            />
                                            {zoomMode === 'toReal' && Number.isFinite(lastRealMs) ? (
                                                <ReferenceLine
                                                    x={lastRealMs}
                                                    stroke="#22c55e"
                                                    strokeDasharray="4 4"
                                                    label={{ value: lastRealIso ? fmtDate(lastRealIso) : 'Última carga', position: 'insideBottomRight', fill: '#22c55e', fontSize: 10 }}
                                                />
                                            ) : (
                                                <ReferenceLine
                                                    x={plannedEndMs}
                                                    stroke="#60a5fa"
                                                    strokeDasharray="4 4"
                                                    label={{ value: fmtDate(plannedWindow?.endDate), position: 'insideBottomRight', fill: '#60a5fa', fontSize: 10 }}
                                                />
                                            )}
                                        </>
                                    )}

                                    <Line
                                        type="monotone"
                                        dataKey="estimado_plot"
                                        name="Estimado"
                                        stroke="#f59e0b"
                                        strokeWidth={2}
                                        dot={false}
                                        connectNulls
                                        isAnimationActive={false}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="real_plot"
                                        name="Real (cargas)"
                                        stroke="#22c55e"
                                        strokeWidth={2}
                                        connectNulls
                                        dot={(props) => {
                                            if (props?.payload?.kind !== 'real') return null;
                                            return <circle cx={props.cx} cy={props.cy} r={3} fill="#22c55e" stroke="#fff" strokeWidth={1} />;
                                        }}
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
