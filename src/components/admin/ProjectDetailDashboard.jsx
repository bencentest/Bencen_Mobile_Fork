import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, BarChart2, CheckCircle2, AlertCircle, List, Layers, Activity, ChevronRight, ChevronDown, RefreshCcw, LineChart as LineChartIcon } from 'lucide-react';
import { api } from '../../services/api';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { HistoryModal } from '../HistoryModal';
import { AvanceChartModal } from '../AvanceChartModal';

function isoToMs(iso) {
    const s = String(iso || '').slice(0, 10);
    if (!s || s.length !== 10) return null;
    const [y, m, d] = s.split('-').map(n => Number(n));
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d, 0, 0, 0, 0);
}

function fmtIsoDDMMYYYY(iso) {
    const s = String(iso || '').slice(0, 10);
    if (s.length !== 10) return '-';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
}

function fmtMsDDMM(ms) {
    if (!Number.isFinite(ms)) return '';
    const dt = new Date(ms);
    const d = String(dt.getUTCDate()).padStart(2, '0');
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    return `${d}/${m}`;
}

function useAggregatePlanVsRealSeries({
    licitacionId,
    itemIds,
    weightsByItemId,
    qtyByItemId,
    unitByItemId
}) {
    const [loading, setLoading] = useState(true);
    const [plannedWindow, setPlannedWindow] = useState(null);
    const [data, setData] = useState([]);
    const [lastRealIso, setLastRealIso] = useState(null);

    const itemIdsKey = useMemo(() => (itemIds || []).map(String).join(','), [itemIds]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                if (!licitacionId || !Array.isArray(itemIds) || itemIds.length === 0) {
                    if (!cancelled) {
                        setPlannedWindow(null);
                        setData([]);
                        setLastRealIso(null);
                        setLoading(false);
                    }
                    return;
                }

                const pw = await api.getPlannedWindowByEstimado({ licitacionId, itemIds });
                if (cancelled) return;

                setPlannedWindow(pw || null);

                if (!pw?.startDate || !pw?.endDate) {
                    setData([]);
                    setLastRealIso(null);
                    setLoading(false);
                    return;
                }

                const [estSeries, realTimeline] = await Promise.all([
                    api.getAvanceEstimadoRealSeries({
                        licitacionId,
                        itemIds,
                        startDate: pw.startDate,
                        endDate: pw.endDate,
                        weightsByItemId,
                        qtyByItemId,
                        unitByItemId
                    }),
                    api.getAvanceCargasTimeline({
                        licitacionId,
                        itemIds,
                        startDate: pw.startDate,
                        endDate: pw.endDate,
                        weightsByItemId,
                        qtyByItemId,
                        unitByItemId
                    })
                ]);

                if (cancelled) return;

                const normIso = (v) => String(v || '').slice(0, 10) || null;

                const estPoints = [{ iso: normIso(pw.startDate), estimado: 0, estimado_qty: 0, unidad: null }];
                (estSeries || []).forEach((p) => {
                    const iso = normIso(p.fecha_hasta || p.fecha_desde);
                    if (!iso) return;
                    estPoints.push({
                        iso,
                        estimado: Number(p.estimado) || 0,
                        estimado_qty: p.estimado_qty ?? null,
                        unidad: p.unidad ?? null
                    });
                });

                const realPoints = [{ iso: normIso(pw.startDate), real: 0, real_qty: 0, unidad: null }];
                (realTimeline || []).forEach((r) => {
                    const iso = normIso(r.avance_iso);
                    if (!iso) return;
                    realPoints.push({
                        iso,
                        real: Number(r.real_cum_pct) || 0,
                        real_qty: r.real_cum_qty ?? null,
                        unidad: r.unidad ?? null
                    });
                });

                const effectiveLastRealIso = realPoints.length > 1 ? (realPoints[realPoints.length - 1].iso || null) : null;
                setLastRealIso(effectiveLastRealIso);

                const isoSet = new Set();
                const startIso = normIso(pw.startDate);
                const endIso = normIso(pw.endDate);
                if (startIso) isoSet.add(startIso);
                if (endIso) isoSet.add(endIso);
                estPoints.forEach(p => { if (p.iso) isoSet.add(p.iso); });
                realPoints.forEach(p => { if (p.iso) isoSet.add(p.iso); });

                const allIsos = Array.from(isoSet).sort();

                const sortedEst = estPoints.filter(p => p.iso).sort((a, b) => a.iso < b.iso ? -1 : 1);
                const sortedReal = realPoints.filter(p => p.iso).sort((a, b) => a.iso < b.iso ? -1 : 1);

                let eIdx = 0;
                let rIdx = 0;
                let lastEst = 0;
                let lastEstQty = null;
                let lastEstUnit = null;
                let lastReal = 0;
                let lastRealQty = null;
                let lastRealUnit = null;

                const series = allIsos.map((iso) => {
                    while (eIdx < sortedEst.length && sortedEst[eIdx].iso <= iso) {
                        lastEst = Number(sortedEst[eIdx].estimado) || 0;
                        if (sortedEst[eIdx].estimado_qty !== null && sortedEst[eIdx].estimado_qty !== undefined) lastEstQty = sortedEst[eIdx].estimado_qty;
                        if (sortedEst[eIdx].unidad) lastEstUnit = sortedEst[eIdx].unidad;
                        eIdx += 1;
                    }
                    while (rIdx < sortedReal.length && sortedReal[rIdx].iso <= iso) {
                        lastReal = Number(sortedReal[rIdx].real) || 0;
                        if (sortedReal[rIdx].real_qty !== null && sortedReal[rIdx].real_qty !== undefined) lastRealQty = sortedReal[rIdx].real_qty;
                        if (sortedReal[rIdx].unidad) lastRealUnit = sortedReal[rIdx].unidad;
                        rIdx += 1;
                    }

                    const x = isoToMs(iso);
                    return {
                        iso,
                        x: x ?? 0,
                        estimado: Math.min(110, Math.max(0, lastEst)),
                        real: Math.min(110, Math.max(0, lastReal)),
                        diff: (Number(lastReal) || 0) - (Number(lastEst) || 0),
                        estimado_qty: lastEstQty,
                        real_qty: lastRealQty,
                        unidad: lastRealUnit || lastEstUnit || null
                    };
                }).filter(p => p.x);

                setData(series);
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setPlannedWindow(null);
                    setData([]);
                    setLastRealIso(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [licitacionId, itemIdsKey, itemIds, weightsByItemId, qtyByItemId, unitByItemId]);

    return { loading, plannedWindow, data, lastRealIso };
}

function AggregateLineTooltip({ active, payload }) {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload;
    if (!row) return null;

    const est = Number(row.estimado) || 0;
    const real = Number(row.real) || 0;
    const diff = real - est;

    const qtyLine = (label, v) => {
        if (v === null || v === undefined) return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        return (
            <div className="flex justify-between gap-4 text-[11px] text-neutral-200">
                <span className="text-neutral-300">{label}</span>
                <span className="font-semibold text-white">{n.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
        );
    };

    return (
        <div className="bg-neutral-900/95 text-white px-3 py-2 rounded-lg shadow-xl border border-white/10 min-w-[220px]">
            <div className="text-[11px] text-neutral-300 mb-1">{fmtIsoDDMMYYYY(row.iso)}</div>
            <div className="flex justify-between gap-4 text-[12px]">
                <span className="text-orange-300">Estimado</span>
                <span className="font-bold">{est.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between gap-4 text-[12px]">
                <span className="text-green-300">Real</span>
                <span className="font-bold">{real.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between gap-4 text-[12px] mt-0.5">
                <span className="text-neutral-300">Diferencia</span>
                <span className={`font-bold ${diff >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)} pp
                </span>
            </div>

            {row.unidad && (
                <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="text-[11px] text-neutral-400 mb-1">Cantidad ({row.unidad})</div>
                    {qtyLine('Estimado acum.', row.estimado_qty)}
                    {qtyLine('Real acum.', row.real_qty)}
                </div>
            )}
        </div>
    );
}

function ProgressRanking({
    items,
    rubros,
    onItemClick,
    onRubroSelect,
    heightClass = ''
}) {
    const [direction, setDirection] = useState('desc'); // desc | asc
    const [mode, setMode] = useState('items'); // items | rubros
    const [rubroFilterId, setRubroFilterId] = useState(''); // '' = todos

    const rubroById = useMemo(() => new Map((rubros || []).map(r => [String(r.id), r])), [rubros]);

    const sorted = useMemo(() => {
        const list = Array.isArray(items) ? [...items] : [];
        const filtered = rubroFilterId
            ? list.filter(i => String(i?.rubro || '').toLowerCase() === String(rubroById.get(String(rubroFilterId))?.descripcion || '').toLowerCase())
            : list;

        filtered.sort((a, b) => {
            const pa = Number(a?.avance) || 0;
            const pb = Number(b?.avance) || 0;
            if (pa === pb) return String(a?.item || a?.id || '').localeCompare(String(b?.item || b?.id || ''));
            return direction === 'asc' ? (pa - pb) : (pb - pa);
        });
        return filtered;
    }, [items, direction, rubroFilterId, rubroById]);

    const rubroRanking = useMemo(() => {
        const list = (rubros || []).map((r) => {
            const itemIds = (r?.itemIds || []).map(String);
            const set = new Set(itemIds);
            const subset = (items || []).filter(i => set.has(String(i?.id)));

            let wSum = 0;
            let wExec = 0;
            subset.forEach((it) => {
                const w = Number(it?.weight) || 0;
                const pct = Math.max(0, Math.min(100, Number(it?.avance) || 0));
                wSum += w;
                wExec += w * (pct / 100);
            });

            const progress = wSum > 0 ? (wExec / wSum) * 100 : 0;

            return {
                id: r.id,
                descripcion: r.descripcion,
                progress,
                itemCount: subset.length
            };
        });

        list.sort((a, b) => {
            const pa = Number(a?.progress) || 0;
            const pb = Number(b?.progress) || 0;
            if (pa === pb) return String(a?.descripcion || a?.id || '').localeCompare(String(b?.descripcion || b?.id || ''));
            return direction === 'asc' ? (pa - pb) : (pb - pa);
        });
        return list;
    }, [rubros, items, direction]);

    const toggle = () => setDirection((d) => (d === 'desc' ? 'asc' : 'desc'));

    return (
        <div className={`bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col ${heightClass}`}>
            <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-neutral-800 flex items-center gap-2 text-sm">
                    <List className="w-4 h-4 text-neutral-600" /> Ranking de ítems
                </h3>
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setMode('items')}
                            className={`h-8 px-2.5 text-[11px] font-bold ${mode === 'items' ? 'bg-blue-50 text-blue-700' : 'bg-white text-neutral-700 hover:bg-gray-50'}`}
                            title="Ver ranking de ítems"
                        >
                            Ítems
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('rubros')}
                            className={`h-8 px-2.5 text-[11px] font-bold ${mode === 'rubros' ? 'bg-blue-50 text-blue-700' : 'bg-white text-neutral-700 hover:bg-gray-50'}`}
                            title="Ver ranking por rubro"
                        >
                            Rubros
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={toggle}
                        className="h-8 px-2.5 rounded-lg border border-gray-200 bg-white text-[11px] font-bold text-neutral-700 hover:border-blue-300 hover:text-blue-700"
                        title="Cambiar orden"
                    >
                        {direction === 'desc' ? 'Desc' : 'Asc'}
                    </button>
                </div>
            </div>
            {mode === 'items' ? (
                <>
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="text-[11px] text-neutral-500">
                            {sorted.length} ítems • 100% arriba • 0% abajo
                        </div>
                        <select
                            value={rubroFilterId}
                            onChange={(e) => setRubroFilterId(e.target.value)}
                            className="h-8 px-2 rounded-lg border border-gray-200 bg-white text-[11px] font-semibold text-neutral-700 max-w-[200px]"
                            title="Filtrar por rubro"
                        >
                            <option value="">Todos</option>
                            {(rubros || []).map((r) => (
                                <option key={String(r.id)} value={String(r.id)}>
                                    {r.descripcion}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {sorted.map((it) => {
                            const pct = Math.max(0, Math.min(100, Number(it?.avance) || 0));
                            const isCompleted = pct >= 99.9;
                            const label = it?.descripcion || it?.item || `Item ${it?.id}`;
                            return (
                                <button
                                    key={String(it?.id ?? it?.item ?? label)}
                                    type="button"
                                    onClick={() => onItemClick?.(it)}
                                    className="w-full text-left p-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/20 transition-colors"
                                    title="Ver detalle"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide truncate">
                                                {it?.rubro || 'General'}
                                            </div>
                                            <div className="text-xs font-medium text-neutral-800 truncate">{label}</div>
                                        </div>
                                        <div className={`text-xs font-black shrink-0 ${isCompleted ? 'text-green-700' : 'text-neutral-700'}`}>
                                            {pct.toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                        {sorted.length === 0 && (
                            <div className="text-sm text-neutral-400 text-center py-10">Sin ítems.</div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    <div className="text-[11px] text-neutral-500 mb-3">
                        {(rubroRanking || []).length} rubros
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {rubroRanking.map((r) => {
                            const pct = Math.max(0, Math.min(100, Number(r?.progress) || 0));
                            const isCompleted = pct >= 99.9;
                            return (
                                <button
                                    key={String(r?.id ?? r?.descripcion)}
                                    type="button"
                                    onClick={() => onRubroSelect?.(r?.id)}
                                    className="w-full text-left p-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/20 transition-colors"
                                    title="Ver rubro"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-neutral-800 truncate">{r?.descripcion}</div>
                                            <div className="text-[10px] text-neutral-500">{r?.itemCount || 0} ítems</div>
                                        </div>
                                        <div className={`text-xs font-black shrink-0 ${isCompleted ? 'text-green-700' : 'text-neutral-700'}`}>
                                            {pct.toFixed(0)}%
                                        </div>
                                    </div>
                                    <div className="mt-2 h-2 rounded-full bg-gray-100 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </button>
                            );
                        })}
                        {rubroRanking.length === 0 && (
                            <div className="text-sm text-neutral-400 text-center py-10">Sin rubros.</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function AggregateLineCard({
    title,
    subtitle,
    itemIds,
    licitacionId,
    weightsByItemId,
    qtyByItemId,
    unitByItemId,
    onOpenChart,
    heightClass = '',
    headerRight = null
}) {
    const { loading, plannedWindow, data, lastRealIso } = useAggregatePlanVsRealSeries({
        licitacionId,
        itemIds,
        weightsByItemId,
        qtyByItemId,
        unitByItemId
    });

    const startMs = useMemo(() => isoToMs(plannedWindow?.startDate), [plannedWindow?.startDate]);
    const endMs = useMemo(() => isoToMs(plannedWindow?.endDate), [plannedWindow?.endDate]);

    const lastRealPoint = useMemo(() => {
        if (!lastRealIso) return null;
        return (data || []).find(d => d.iso === lastRealIso) || null;
    }, [data, lastRealIso]);

    const headerStats = useMemo(() => {
        if (!lastRealPoint) return null;
        const est = Number(lastRealPoint.estimado) || 0;
        const real = Number(lastRealPoint.real) || 0;
        const diff = real - est;
        return { est, real, diff, iso: lastRealPoint.iso };
    }, [lastRealPoint]);

    return (
        <div className={`bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col ${heightClass}`}>
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    <h3 className="font-bold text-neutral-800 text-sm truncate">{title}</h3>
                    {subtitle && (
                        <div className="text-[11px] text-neutral-500 truncate">{subtitle}</div>
                    )}
                    {plannedWindow?.startDate && plannedWindow?.endDate && (
                        <div className="text-[11px] text-neutral-400 mt-1">
                            Periodo estimado: {fmtIsoDDMMYYYY(plannedWindow.startDate)} - {fmtIsoDDMMYYYY(plannedWindow.endDate)}
                        </div>
                    )}
                </div>
                <div className="flex items-start gap-2 shrink-0">
                    {headerRight}
                    <button
                        type="button"
                        onClick={() => onOpenChart?.({ title, subtitle, itemIds })}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:text-blue-700 hover:border-blue-300 bg-white shrink-0"
                        title="Abrir gráfico en grande"
                    >
                        <LineChartIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {headerStats && (
                <div className="flex items-center justify-between gap-2 text-[11px] mb-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <div className="text-neutral-600">
                        Al {fmtIsoDDMMYYYY(headerStats.iso)}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-orange-700 font-bold">E {headerStats.est.toFixed(1)}%</span>
                        <span className="text-green-700 font-bold">R {headerStats.real.toFixed(1)}%</span>
                        <span className={`font-bold ${headerStats.diff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {headerStats.diff >= 0 ? '+' : ''}{headerStats.diff.toFixed(1)} pp
                        </span>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-[220px] w-full">
                {loading ? (
                    <div className="h-full w-full flex items-center justify-center text-neutral-400 text-sm">
                        Cargando gráfico...
                    </div>
                ) : (!plannedWindow?.startDate || !plannedWindow?.endDate) ? (
                    <div className="h-full w-full flex items-center justify-center text-neutral-400 text-sm">
                        Sin periodo estimado para este recorte.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data || []} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis
                                dataKey="x"
                                type="number"
                                domain={startMs && endMs ? [startMs, endMs] : ['auto', 'auto']}
                                scale="time"
                                tickFormatter={fmtMsDDMM}
                                tick={{ fontSize: 10, fill: '#6b7280' }}
                            />
                            <YAxis
                                domain={[0, 110]}
                                tickFormatter={(v) => `${v}%`}
                                tick={{ fontSize: 10, fill: '#6b7280' }}
                                width={40}
                            />
                            <RechartsTooltip content={<AggregateLineTooltip />} />
                            <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />
                            <Line
                                type="monotone"
                                dataKey="estimado"
                                name="Estimado"
                                stroke="#f97316"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                            />
                            <Line
                                type="monotone"
                                dataKey="real"
                                name="Real (cargas)"
                                stroke="#22c55e"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}

export function ProjectDetailDashboard({ projectId, onBack, currentRole = null }) {
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);

    const persistKey = useMemo(() => `bencen_admin_project_detail_${String(projectId || '')}`, [projectId]);
    const [activeTab, setActiveTab] = useState(() => {
        try {
            const raw = localStorage.getItem(`bencen_admin_project_detail_tab_${String(projectId || '')}`);
            return raw === 'plan' || raw === 'feed' || raw === 'planning' ? raw : 'feed';
        } catch {
            return 'feed';
        }
    }); // 'feed' | 'plan' | 'planning'

    const [expandedGroups, setExpandedGroups] = useState(() => {
        try {
            const raw = localStorage.getItem(`${persistKey}_expandedGroups`);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });

    const [expandedSubgroups, setExpandedSubgroups] = useState(() => {
        try {
            const raw = localStorage.getItem(`${persistKey}_expandedSubgroups`);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    });

    const [viewingItem, setViewingItem] = useState(null);
    const [chartContext, setChartContext] = useState(null); // { title, subtitle, itemIds }

    const loadData = () => {
        setLoading(true);
        api.getProjectDetails(projectId).then(data => {
            setDetails(data);
            setLoading(false);
        });
    };

    useEffect(() => {
        loadData();
    }, [projectId]);

    useEffect(() => {
        try {
            localStorage.setItem(`bencen_admin_project_detail_tab_${String(projectId || '')}`, activeTab);
        } catch {
            void 0;
        }
    }, [projectId, activeTab]);

    useEffect(() => {
        try {
            localStorage.setItem(`${persistKey}_expandedGroups`, JSON.stringify(expandedGroups || {}));
        } catch {
            void 0;
        }
    }, [persistKey, expandedGroups]);

    useEffect(() => {
        try {
            localStorage.setItem(`${persistKey}_expandedSubgroups`, JSON.stringify(expandedSubgroups || {}));
        } catch {
            void 0;
        }
    }, [persistKey, expandedSubgroups]);

    const weightsByItemId = useMemo(() => {
        const map = {};
        (details?.items || []).forEach(i => {
            if (i?.id) map[String(i.id)] = Number(i.weight) || 1;
        });
        return map;
    }, [details]);

    const qtyByItemId = useMemo(() => {
        const map = {};
        (details?.items || []).forEach(i => {
            if (i?.id) map[String(i.id)] = Number(i.cantidad) || 0;
        });
        return map;
    }, [details]);

    const unitByItemId = useMemo(() => {
        const map = {};
        (details?.items || []).forEach(i => {
            if (i?.id) map[String(i.id)] = i.unidad || null;
        });
        return map;
    }, [details]);

    const isAdminRole = currentRole === 'admin' || currentRole === 'admin_gerencia';
    const topCardHeightClass = 'h-[440px]';

    const allItemIds = useMemo(() => (details?.items || []).map(i => i?.id).filter(Boolean), [details]);

    const groupsForSelector = useMemo(() => {
        const out = [];
        (details?.tree || []).forEach((g) => {
            const groupItemIds = [
                ...(g?.directItems?.map(i => i.id) || []),
                ...(g?.subgroups?.flatMap(s => (s?.items || []).map(i => i.id)) || [])
            ].filter(Boolean);
            if (groupItemIds.length === 0) return;
            out.push({
                id: g.id,
                descripcion: g.descripcion,
                itemIds: groupItemIds
            });
        });
        return out;
    }, [details]);

    const selectedGroupPersistKey = useMemo(() => `${persistKey}_selectedGroupId`, [persistKey]);
    const [selectedGroupId, setSelectedGroupId] = useState(() => {
        try {
            const raw = localStorage.getItem(selectedGroupPersistKey);
            return raw ? String(raw) : null;
        } catch {
            return null;
        }
    });

    const effectiveSelectedGroupId = useMemo(() => {
        return selectedGroupId ?? (groupsForSelector[0]?.id ?? null);
    }, [selectedGroupId, groupsForSelector]);

    useEffect(() => {
        try {
            if (!effectiveSelectedGroupId) return;
            localStorage.setItem(selectedGroupPersistKey, String(effectiveSelectedGroupId));
        } catch {
            void 0;
        }
    }, [selectedGroupPersistKey, effectiveSelectedGroupId]);

    const selectedGroup = useMemo(() => {
        if (!effectiveSelectedGroupId) return null;
        return groupsForSelector.find(g => String(g.id) === String(effectiveSelectedGroupId)) || null;
    }, [groupsForSelector, effectiveSelectedGroupId]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-900"></div>
            </div>
        );
    }

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans transition-all animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="bg-neutral-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-md">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 rounded-full hover:bg-neutral-800 transition-colors text-white"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">Detalle de Proyecto</h1>
                        <p className="text-xs text-neutral-400">Visión Integral de Avance</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const ids = (details?.items || []).map(i => i.id);
                            setChartContext({
                                title: 'Avance General (Estimado vs Real)',
                                subtitle: 'Licitación',
                                itemIds: ids
                            });
                        }}
                        className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                        title="Ver gráfico general"
                    >
                        <LineChartIcon className="w-5 h-5" />
                    </button>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                        title="Actualizar Datos"
                    >
                        <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 p-4 md:p-6 w-full mx-auto space-y-6">

                {/* Top Summary */}
                {isAdminRole && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                        <div className="lg:col-span-1">
                            <ProgressRanking
                                items={details?.items || []}
                                rubros={groupsForSelector}
                                onItemClick={setViewingItem}
                                onRubroSelect={(id) => setSelectedGroupId(id ? String(id) : null)}
                                heightClass={topCardHeightClass}
                            />
                        </div>
                        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                            <div className="md:col-span-1">
                                <AggregateLineCard
                                    title="Total del rubro (Estimado vs Real)"
                                    subtitle={selectedGroup?.descripcion || ''}
                                    licitacionId={projectId}
                                    itemIds={selectedGroup?.itemIds || []}
                                    weightsByItemId={weightsByItemId}
                                    qtyByItemId={qtyByItemId}
                                    unitByItemId={unitByItemId}
                                    onOpenChart={(ctx) => setChartContext(ctx)}
                                    heightClass={topCardHeightClass}
                                    headerRight={
                                        <select
                                            value={effectiveSelectedGroupId ?? ''}
                                            onChange={(e) => setSelectedGroupId(e.target.value)}
                                            className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-[12px] font-semibold text-neutral-700 max-w-[260px]"
                                            title="Seleccionar rubro"
                                        >
                                            {groupsForSelector.map((g) => (
                                                <option key={String(g.id)} value={String(g.id)}>
                                                    {g.descripcion}
                                                </option>
                                            ))}
                                        </select>
                                    }
                                />
                            </div>
                            <div className="md:col-span-1">
                                <AggregateLineCard
                                    title="Total de la obra (Estimado vs Real)"
                                    subtitle="Obra completa"
                                    licitacionId={projectId}
                                    itemIds={allItemIds}
                                    weightsByItemId={weightsByItemId}
                                    qtyByItemId={qtyByItemId}
                                    unitByItemId={unitByItemId}
                                    onOpenChart={(ctx) => setChartContext(ctx)}
                                    heightClass={topCardHeightClass}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {!isAdminRole && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Donut Charts Grid: Top 4 Advanced Groups (NOW 2/3 WIDTH) */}
                    <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 content-start">
                        <div className="col-span-2 md:col-span-4 pb-1">
                            <h3 className="font-bold text-neutral-800 flex items-center gap-2 text-sm">
                                <BarChart2 className="w-4 h-4 text-blue-600" /> Grupos Activos (Top 4)
                            </h3>
                        </div>
                        {details?.weeklyTopGroups?.map((group, idx) => (
                            <div key={idx} className="flex flex-col items-center justify-center relative h-[140px]">
                                <h4 className="text-[10px] font-bold text-neutral-600 text-center uppercase tracking-wide line-clamp-2 px-1 mb-2 leading-tight h-8 flex items-center justify-center">
                                    {group.name}
                                </h4>
                                <div className="w-24 h-24 relative shrink-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { value: group.totalProgress },
                                                    { value: 100 - group.totalProgress }
                                                ]}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={32}
                                                outerRadius={45}
                                                startAngle={90}
                                                endAngle={-270}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                <Cell fill={COLORS[idx % COLORS.length]} />
                                                <Cell fill="#e5e7eb" />
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className={`font-black text-lg`} style={{ color: COLORS[idx % COLORS.length] }}>
                                            {group.totalProgress.toFixed(0)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!details?.weeklyTopGroups || details.weeklyTopGroups.length === 0) && (
                            <div className="col-span-2 md:col-span-4 text-center text-neutral-400 text-sm py-10 bg-white rounded-2xl border border-gray-100">
                                Sin avances esta semana
                            </div>
                        )}
                    </div>

                    {/* Near Completion Items - Simplified List (NOW 1/3 WIDTH) */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 lg:col-span-1 flex flex-col">
                        <h3 className="font-bold text-neutral-800 mb-4 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-600" /> Próximos a Terminar (90%+)
                        </h3>
                        {details?.nearCompletion.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 py-10">
                                <CheckCircle2 className="w-10 h-10 mb-2 opacity-20" />
                                <p>No hay ítems.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-2 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                                {details?.nearCompletion.map((item, idx) => {
                                    const remaining = 100 - item.avance;
                                    return (
                                        <div key={idx} className="p-2 bg-neutral-50 border border-neutral-100 rounded-lg flex justify-between items-center group hover:bg-white hover:shadow-sm transition-all cursor-pointer" onClick={() => setViewingItem(item)}>
                                            <div className="overflow-hidden pr-2">
                                                <p className="text-[9px] text-neutral-500 font-bold uppercase tracking-wider truncate mb-0.5">{item.rubro}</p>
                                                <p className="font-medium text-xs text-neutral-800 truncate" title={item.descripcion || item.item}>
                                                    {item.descripcion || item.item}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end shrink-0 pl-2 border-l border-neutral-200">
                                                <span className="text-[9px] text-neutral-400 uppercase font-bold">Falta</span>
                                                <span className="font-black text-sm text-orange-500 leading-none">{remaining.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
                )}

                {/* Main Content: Tabs */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[500px]">
                    <div className="flex border-b border-gray-100">
                        <button
                            onClick={() => setActiveTab('feed')}
                            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'feed' ? 'text-blue-600 bg-blue-50/50 border-b-2 border-blue-600' : 'text-neutral-500 hover:bg-gray-50'}`}
                        >
                            <Activity className="w-4 h-4" /> Feed en Vivo
                        </button>
                        <button
                            onClick={() => setActiveTab('plan')}
                            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'plan' ? 'text-purple-600 bg-purple-50/50 border-b-2 border-purple-600' : 'text-neutral-500 hover:bg-gray-50'}`}
                        >
                            <Layers className="w-4 h-4" /> Plan Completo
                        </button>
                        <button
                            onClick={() => setActiveTab('planning')}
                            className={`flex-1 py-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'planning' ? 'text-orange-600 bg-orange-50/50 border-b-2 border-orange-600' : 'text-neutral-500 hover:bg-gray-50'}`}
                        >
                            <BarChart2 className="w-4 h-4" /> Planificación Estimada
                        </button>
                    </div>

                    <div className="p-0 flex-1 bg-gray-50/30">
                        {activeTab === 'feed' && (
                            <div className="divide-y divide-gray-100">
                                {details?.feed.map((report) => (
                                    <div key={report.id} className="p-4 hover:bg-white transition-colors flex gap-4 items-start">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                                            {report.avance.toFixed(0)}%
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="font-bold text-neutral-900 text-sm truncate pr-2">
                                                    {report.title}
                                                </p>
                                                <span className="text-[10px] text-neutral-400 shrink-0 ml-2 bg-gray-100 px-2 py-0.5 rounded-full">{new Date(report.created_at).toLocaleDateString()}</span>
                                            </div>
                                            <p className="text-xs text-neutral-600 mb-1 line-clamp-1">{report.description}</p>
                                            <p className="text-[10px] text-neutral-400 mb-1 italic">Reportado por {report.mobile_users?.name || 'Usuario'}</p>

                                            {report.observaciones && (
                                                <p className="text-xs text-neutral-600 bg-gray-100 p-2 rounded-lg italic mt-2 border border-gray-200">
                                                    "{report.observaciones}"
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {details?.feed.length === 0 && (
                                    <div className="p-10 text-center text-neutral-400">Sin actividad reciente.</div>
                                )}
                            </div>
                        )}

                        {activeTab === 'plan' && (
                            <PlanTreeView
                                tree={details?.tree || []}
                                onItemClick={setViewingItem}
                                onChart={(ctx) => setChartContext(ctx)}
                                expandedGroups={expandedGroups}
                                expandedSubgroups={expandedSubgroups}
                                setExpandedGroups={setExpandedGroups}
                                setExpandedSubgroups={setExpandedSubgroups}
                            />
                        )}

                        {activeTab === 'planning' && (
                            <PlanningGanttView
                                projectId={projectId}
                                tree={details?.tree || []}
                                items={details?.items || []}
                                onItemClick={setViewingItem}
                                expandedGroups={expandedGroups}
                                expandedSubgroups={expandedSubgroups}
                                setExpandedGroups={setExpandedGroups}
                                setExpandedSubgroups={setExpandedSubgroups}
                            />
                        )}
                    </div>
                </div>

            </div>

            {/* Item History / Detail Modal */}
            {viewingItem && (
                <HistoryModal
                    item={viewingItem}
                    currentRole={currentRole}
                    onClose={() => { setViewingItem(null); loadData(); }} // Reload to refresh data if changed
                    onUpdate={() => { /* HistoryModal handles internal updates, but we refresh parent on close */ }}
                />
            )}

            {chartContext && (
                <AvanceChartModal
                    licitacionId={projectId}
                    itemIds={chartContext.itemIds}
                    weightsByItemId={weightsByItemId}
                    qtyByItemId={qtyByItemId}
                    unitByItemId={unitByItemId}
                    title={chartContext.title}
                    subtitle={chartContext.subtitle}
                    onClose={() => setChartContext(null)}
                />
            )}
        </div>
    );
}

// PREMIUM DENSE PLAN VIEW
function PlanTreeView({
    tree,
    onItemClick,
    onChart,
    expandedGroups,
    expandedSubgroups,
    setExpandedGroups,
    setExpandedSubgroups
}) {
    const [searchTerm, setSearchTerm] = useState('');

    const toggleGroup = (id) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
    const toggleSubgroup = (id) => setExpandedSubgroups(prev => ({ ...prev, [id]: !prev[id] }));

    const normalizedTerm = useMemo(() => String(searchTerm || '').trim().toLowerCase(), [searchTerm]);

    const allGroupIds = useMemo(() => (tree || []).map(g => g?.id).filter(Boolean), [tree]);
    const allSubgroupIds = useMemo(() => (tree || []).flatMap(g => (g?.subgroups || []).map(s => s?.id)).filter(Boolean), [tree]);

    const expandAll = () => {
        const g = {};
        allGroupIds.forEach((id) => { g[id] = true; });
        const s = {};
        allSubgroupIds.forEach((id) => { s[id] = true; });
        setExpandedGroups(g);
        setExpandedSubgroups(s);
    };

    const collapseAll = () => {
        setExpandedGroups({});
        setExpandedSubgroups({});
    };

    const filteredTree = useMemo(() => {
        if (!normalizedTerm) return tree;

        const matches = (v) => String(v || '').toLowerCase().includes(normalizedTerm);
        const itemMatches = (item) => matches(item?.descripcion) || matches(item?.item);

        return (tree || []).map((group) => {
            const groupMatches = matches(group?.descripcion);

            const subgroups = (group?.subgroups || []).map((sub) => {
                const subMatches = matches(sub?.descripcion);
                const items = subMatches ? (sub?.items || []) : (sub?.items || []).filter(itemMatches);
                if (subMatches) return { ...sub, items };
                if (items.length > 0) return { ...sub, items };
                return null;
            }).filter(Boolean);

            const directItems = groupMatches ? (group?.directItems || []) : (group?.directItems || []).filter(itemMatches);

            const include = groupMatches || directItems.length > 0 || subgroups.length > 0;
            if (!include) return null;

            if (groupMatches) return { ...group };
            return { ...group, subgroups, directItems };
        }).filter(Boolean);
    }, [tree, normalizedTerm]);

    const treeToRender = normalizedTerm ? filteredTree : tree;

    const groupDisplayCount = (group) => {
        const directCount = group?.directItems?.length || 0;
        const subCount = (group?.subgroups || []).reduce((sum, s) => sum + (s?.items?.length || 0), 0);
        return directCount + subCount;
    };

    if (!tree || tree.length === 0) {
        return <div className="p-8 text-center text-neutral-400 text-sm">No hay esquema definido.</div>;
    }

    return (
        <div className="bg-white/80 backdrop-blur-sm shadow-sm border-t border-gray-100 divide-y divide-gray-100">
            <div className="p-3 border-b border-gray-100 bg-white/90 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar item..."
                        className="h-10 px-3 rounded-lg bg-gray-100 border border-transparent focus:bg-white focus:border-blue-400 focus:ring-blue-400 text-sm transition-all placeholder:text-gray-400 flex-1 max-w-[420px]"
                    />
                    <button
                        type="button"
                        disabled={Boolean(normalizedTerm)}
                        onClick={expandAll}
                        className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-neutral-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={normalizedTerm ? 'Desactivado mientras buscás (los grupos se abren automáticamente)' : 'Expandir todos los grupos'}
                    >
                        Expandir
                    </button>
                    <button
                        type="button"
                        disabled={Boolean(normalizedTerm)}
                        onClick={collapseAll}
                        className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-neutral-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={normalizedTerm ? 'Desactivado mientras buscás (los grupos se abren automáticamente)' : 'Contraer todos los grupos'}
                    >
                        Contraer
                    </button>
                </div>
                {normalizedTerm && (
                    <div className="text-[11px] text-neutral-500 mt-2">
                        Resultados: <span className="font-semibold text-neutral-700">{treeToRender.length}</span> grupo(s)
                    </div>
                )}
            </div>

            {treeToRender.length === 0 ? (
                <div className="p-10 text-center text-neutral-400 text-sm">
                    No se encontraron ítems.
                </div>
            ) : treeToRender.map((group) => {
                const isExpanded = normalizedTerm ? true : (expandedGroups[group.id] || false);
                const hasProgress = group.progress > 0;
                const groupItemIds = [
                    ...(group.directItems?.map(i => i.id) || []),
                    ...(group.subgroups?.flatMap(s => s.items?.map(i => i.id) || []) || [])
                ];

                return (
                    <div key={group.id} className="bg-white">
                        {/* Group Header */}
                        <button
                            onClick={() => toggleGroup(group.id)}
                            className={`w-full px-4 py-2.5 flex items-center justify-between group transition-colors ${isExpanded ? 'bg-blue-50/20' : 'hover:bg-gray-50'}`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
                                <div className="flex flex-col items-start overflow-hidden">
                                    <h3 className="font-bold text-neutral-800 text-xs uppercase tracking-wide truncate">{group.descripcion}</h3>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onChart?.({
                                            title: 'Avance por Grupo (Estimado vs Real)',
                                            subtitle: group.descripcion,
                                            itemIds: groupItemIds
                                        });
                                    }}
                                    className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:text-blue-700 hover:border-blue-300 bg-white"
                                    title="Ver gráfico del grupo"
                                >
                                    <LineChartIcon className="w-4 h-4" />
                                </button>
                                {hasProgress && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-200"></span>
                                )}
                                <span className="text-[10px] text-neutral-400 font-medium">
                                    {normalizedTerm ? groupDisplayCount(group) : group.itemCount}
                                </span>
                            </div>
                        </button>

                        {isExpanded && (
                            <div className="divide-y divide-dotted divide-gray-100 bg-white">
                                {/* Subgroups */}
                                {group.subgroups?.map(subgroup => {
                                    const subExpanded = normalizedTerm ? true : (expandedSubgroups[subgroup.id] || false);
                                    const subHasProgress = subgroup.items?.some(i => i.avance > 0);
                                    const subItemIds = subgroup.items?.map(i => i.id) || [];

                                    return (
                                        <div key={subgroup.id}>
                                            <button
                                                onClick={() => toggleSubgroup(subgroup.id)}
                                                className="w-full pl-8 pr-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1 h-1 rounded-full ${subHasProgress ? 'bg-blue-400' : 'bg-gray-200'}`}></div>
                                                    <span className="text-xs font-bold text-neutral-600 uppercase tracking-wide text-left">{subgroup.descripcion}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onChart?.({
                                                                title: 'Avance por Subgrupo (Estimado vs Real)',
                                                                subtitle: subgroup.descripcion,
                                                                itemIds: subItemIds
                                                            });
                                                        }}
                                                        className="p-1.5 rounded-md border border-gray-200 text-gray-500 hover:text-blue-700 hover:border-blue-300 bg-white"
                                                        title="Ver gráfico del subgrupo"
                                                    >
                                                        <LineChartIcon className="w-4 h-4" />
                                                    </button>
                                                    {subExpanded ? <ChevronDown className="w-3 h-3 text-neutral-400" /> : <ChevronRight className="w-3 h-3 text-neutral-300" />}
                                                </div>
                                            </button>

                                            {subExpanded && (
                                                <div className="pl-6">
                                                    {subgroup.items?.map(item => (
                                                        <PlanItemRow
                                                            key={item.id}
                                                            item={item}
                                                            onClick={() => onItemClick(item)}
                                                            onChart={() => onChart?.({
                                                                title: 'Avance del Ítem (Estimado vs Real)',
                                                                subtitle: `${item.item} ${item.descripcion}`.trim(),
                                                                itemIds: [item.id]
                                                            })}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Direct Items in Group */}
                                <div>
                                    {group.directItems?.map(item => (
                                        <PlanItemRow
                                            key={item.id}
                                            item={item}
                                            onClick={() => onItemClick(item)}
                                            onChart={() => onChart?.({
                                                title: 'Avance del Ítem (Estimado vs Real)',
                                                subtitle: `${item.item} ${item.descripcion}`.trim(),
                                                itemIds: [item.id]
                                            })}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function PlanItemRow({ item, onClick, onChart }) {
    const isCompleted = item.avance >= 99.9;
    const inProgress = item.avance > 0 && !isCompleted;

    return (
        <button
            onClick={onClick}
            className="w-full text-left pl-8 pr-4 py-1.5 hover:bg-blue-50/10 flex items-center justify-between text-xs group transition-all border-l-[3px] border-transparent hover:border-blue-400"
        >
            <div className="flex-1 pr-4 min-w-0 flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCompleted ? 'bg-green-500 shadow-sm shadow-green-200' : inProgress ? 'bg-blue-500 shadow-sm shadow-blue-200' : 'bg-gray-200'}`}></div>
                <div className="min-w-0">
                    <p className="font-medium text-neutral-700 truncate group-hover:text-blue-700 transition-colors">{item.descripcion}</p>
                    <p className="font-mono text-[9px] text-neutral-400">{item.item}</p>
                </div>
            </div>
            <div className="flex flex-col items-end shrink-0 pl-2">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onChart?.(); }}
                    className="p-1 rounded-md border border-gray-200 text-gray-500 hover:text-blue-700 hover:border-blue-300 bg-white mb-1"
                    title="Ver gráfico del ítem"
                >
                    <LineChartIcon className="w-3.5 h-3.5" />
                </button>
                {inProgress || isCompleted ? (
                    <span className={`font-bold ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}>
                        {item.avance.toFixed(0)}%
                    </span>
                ) : (
                    <span className="text-neutral-300">-</span>
                )}
            </div>
        </button>
    );
}

function PlanningGanttView({
    projectId,
    tree,
    items,
    onItemClick,
    expandedGroups,
    expandedSubgroups,
    setExpandedGroups,
    setExpandedSubgroups
}) {
    const viewPersistKey = useMemo(() => `bencen_admin_planning_view_${String(projectId || '')}`, [projectId]);

    const [searchTerm, setSearchTerm] = useState(() => {
        try {
            const raw = localStorage.getItem(`${viewPersistKey}_search`);
            return raw ? String(raw) : '';
        } catch {
            return '';
        }
    });
    const [zoomMode, setZoomMode] = useState(() => {
        try {
            const raw = localStorage.getItem(`${viewPersistKey}_zoom`);
            return raw === 'toReal' || raw === 'plan' ? raw : 'plan';
        } catch {
            return 'plan';
        }
    }); // plan | toReal
    const [valueMode, setValueMode] = useState(() => {
        try {
            const raw = localStorage.getItem(`${viewPersistKey}_value`);
            return raw === 'qty' || raw === 'pct' ? raw : 'pct';
        } catch {
            return 'pct';
        }
    }); // pct | qty
    const [loading, setLoading] = useState(true);
    const [months, setMonths] = useState([]); // [{key,label,start,end}]
    const [estByItemId, setEstByItemId] = useState({});
    const [realByItemId, setRealByItemId] = useState({});
    const [plannedWindow, setPlannedWindow] = useState(null);
    const [tooltip, setTooltip] = useState(null); // { x,y,title,lines:[] }

    const normalizedTerm = useMemo(() => String(searchTerm || '').trim().toLowerCase(), [searchTerm]);

    const itemIds = useMemo(() => (items || []).map(i => i?.id).filter(Boolean), [items]);
    const itemIdsKey = useMemo(() => itemIds.map(String).join(','), [itemIds]);
    const itemById = useMemo(() => new Map((items || []).map(i => [String(i.id), i])), [items]);

    const canAnyQty = useMemo(() => {
        return (items || []).some((i) => {
            const q = Number(i?.cantidad);
            const u = i?.unidad ? String(i.unidad) : '';
            return Number.isFinite(q) && q > 0 && Boolean(u);
        });
    }, [items]);

    useEffect(() => {
        try { localStorage.setItem(`${viewPersistKey}_search`, String(searchTerm || '')); } catch { void 0; }
    }, [viewPersistKey, searchTerm]);

    useEffect(() => {
        try { localStorage.setItem(`${viewPersistKey}_zoom`, String(zoomMode || 'plan')); } catch { void 0; }
    }, [viewPersistKey, zoomMode]);

    useEffect(() => {
        try { localStorage.setItem(`${viewPersistKey}_value`, String(valueMode || 'pct')); } catch { void 0; }
    }, [viewPersistKey, valueMode]);

    const allGroupIds = useMemo(() => (tree || []).map(g => g?.id).filter(Boolean), [tree]);
    const allSubgroupIds = useMemo(() => (tree || []).flatMap(g => (g?.subgroups || []).map(s => s?.id)).filter(Boolean), [tree]);

    const expandAll = () => {
        const g = {};
        allGroupIds.forEach((id) => { g[id] = true; });
        const s = {};
        allSubgroupIds.forEach((id) => { s[id] = true; });
        setExpandedGroups(g);
        setExpandedSubgroups(s);
    };

    const collapseAll = () => {
        setExpandedGroups({});
        setExpandedSubgroups({});
    };

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            try {
                const [pw, monthly] = await Promise.all([
                    api.getPlannedWindowByEstimado({ licitacionId: projectId, itemIds }),
                    api.getMonthlyPlanVsReal({ licitacionId: projectId, itemIds })
                ]);
                if (cancelled) return;
                setPlannedWindow(pw || null);
                setMonths(monthly?.months || []);
                setEstByItemId(monthly?.estByItemId || {});
                setRealByItemId(monthly?.realByItemId || {});
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setMonths([]);
                    setEstByItemId({});
                    setRealByItemId({});
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        if (!projectId || itemIds.length === 0) {
            setMonths([]);
            setEstByItemId({});
            setRealByItemId({});
            setLoading(false);
            return () => { };
        }

        load();
        return () => { cancelled = true; };
    }, [projectId, itemIdsKey, itemIds]);

    const monthKeyOfIso = (iso) => {
        const s = String(iso || '');
        return s.length >= 7 ? s.slice(0, 7) : null;
    };

    const plannedStartKey = useMemo(() => monthKeyOfIso(plannedWindow?.startDate), [plannedWindow?.startDate]);
    const plannedEndKey = useMemo(() => monthKeyOfIso(plannedWindow?.endDate), [plannedWindow?.endDate]);

    const lastRealKey = useMemo(() => {
        const keys = new Set();
        Object.values(realByItemId || {}).forEach(map => {
            Object.keys(map || {}).forEach(k => keys.add(k));
        });
        return Array.from(keys).sort().pop() || null;
    }, [realByItemId]);

    const monthsToRender = useMemo(() => {
        const all = months || [];
        if (all.length === 0) return [];

        const startKey = plannedStartKey || all[0].key;
        const endKey = zoomMode === 'toReal' ? (lastRealKey || plannedEndKey || all[all.length - 1].key) : (plannedEndKey || all[all.length - 1].key);

        const startIdx = all.findIndex(m => m.key >= startKey);
        const endIdx = (() => {
            let idx = -1;
            for (let i = 0; i < all.length; i++) if (all[i].key <= endKey) idx = i;
            return idx;
        })();

        if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return all;
        return all.slice(startIdx, endIdx + 1);
    }, [months, plannedStartKey, plannedEndKey, lastRealKey, zoomMode]);

    const renderRows = useMemo(() => {
        if (!tree || tree.length === 0) return [];
        const matches = (v) => String(v || '').toLowerCase().includes(normalizedTerm);
        const itemMatches = (item) => matches(item?.descripcion) || matches(item?.item);

        const rows = [];

        (tree || []).forEach((group) => {
            const groupMatches = !normalizedTerm ? true : matches(group?.descripcion);

            const directItems = (group?.directItems || []).filter((it) => !normalizedTerm || itemMatches(it) || groupMatches);
            const subgroups = (group?.subgroups || []).map((sub) => {
                const subMatches = !normalizedTerm ? true : matches(sub?.descripcion) || groupMatches;
                const subItems = (sub?.items || []).filter((it) => !normalizedTerm || itemMatches(it) || subMatches);
                if (subItems.length === 0) return null;
                return { ...sub, items: subItems, _forceOpen: Boolean(normalizedTerm) };
            }).filter(Boolean);

            const includeGroup = groupMatches || directItems.length > 0 || subgroups.length > 0;
            if (!includeGroup) return;

            rows.push({ type: 'group', level: 0, node: group, forceOpen: Boolean(normalizedTerm) });
            const groupOpen = Boolean(normalizedTerm) || Boolean(expandedGroups[group.id]);
            if (!groupOpen) return;

            subgroups.forEach((sub) => {
                rows.push({ type: 'subgroup', level: 1, node: sub, parent: group, forceOpen: Boolean(normalizedTerm) });
                const subOpen = Boolean(normalizedTerm) || Boolean(expandedSubgroups[sub.id]);
                if (!subOpen) return;
                (sub.items || []).forEach((it) => rows.push({ type: 'item', level: 2, node: it, parent: sub }));
            });

            directItems.forEach((it) => rows.push({ type: 'item', level: 1, node: it, parent: group }));
        });

        return rows;
    }, [tree, normalizedTerm, expandedGroups, expandedSubgroups]);

    const fmtMonthLabel = (key) => {
        const [y, m] = String(key || '').split('-');
        return y && m ? `${m}/${String(y).slice(2)}` : String(key || '');
    };

    const getPct = (map, itemId, monthKey) => Number(map?.[String(itemId)]?.[monthKey]) || 0;

    const cumPctUpTo = (map, itemId, monthKey) => {
        const keys = monthsToRender.map(m => m.key);
        let sum = 0;
        for (const k of keys) {
            sum += getPct(map, itemId, k);
            if (k === monthKey) break;
        }
        return sum;
    };

    const weightForItemId = (itemId) => {
        const it = itemById.get(String(itemId));
        const w = Number(it?.weight);
        return Number.isFinite(w) && w > 0 ? w : 1;
    };

    const aggPctForMonth = (map, itemIdList, monthKey) => {
        let sumW = 0;
        let sum = 0;
        (itemIdList || []).forEach((id) => {
            const w = weightForItemId(id);
            sumW += w;
            sum += w * getPct(map, id, monthKey);
        });
        if (sumW <= 0) return 0;
        return sum / sumW;
    };

    const aggCumPctUpTo = (map, itemIdList, monthKey) => {
        let sumW = 0;
        let sum = 0;
        (itemIdList || []).forEach((id) => {
            const w = weightForItemId(id);
            sumW += w;
            sum += w * cumPctUpTo(map, id, monthKey);
        });
        if (sumW <= 0) return 0;
        return sum / sumW;
    };

    const fmtQty = (n) => {
        const v = Number(n);
        if (!Number.isFinite(v)) return '-';
        if (Math.abs(v) >= 100) return v.toLocaleString('es-AR', { maximumFractionDigits: 0 });
        return v.toLocaleString('es-AR', { maximumFractionDigits: 2 });
    };

    const showTooltip = (evt, title, lines) => {
        const margin = 12;
        const x = Math.min(window.innerWidth - 260, evt.clientX + margin);
        const y = Math.min(window.innerHeight - 140, evt.clientY + margin);
        setTooltip({ x, y, title, lines });
    };

    const hideTooltip = () => setTooltip(null);

    const scrollRef = React.useRef(null);
    const scrollPersistKey = `${viewPersistKey}_scroll`;

    useEffect(() => {
        if (loading) return;
        if (!scrollRef.current) return;
        try {
            const raw = localStorage.getItem(scrollPersistKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const top = Number(parsed?.top);
            const left = Number(parsed?.left);
            if (Number.isFinite(top)) scrollRef.current.scrollTop = top;
            if (Number.isFinite(left)) scrollRef.current.scrollLeft = left;
        } catch {
            void 0;
        }
    }, [loading, scrollPersistKey, monthsToRender.length]);

    if (!tree || tree.length === 0) {
        return <div className="p-8 text-center text-neutral-400 text-sm">No hay esquema definido.</div>;
    }

    return (
        <div className="h-full flex flex-col">
            <div className="p-3 border-b border-gray-100 bg-white/90 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar item..."
                        className="h-10 px-3 rounded-lg bg-gray-100 border border-transparent focus:bg-white focus:border-orange-400 focus:ring-orange-400 text-sm transition-all placeholder:text-gray-400 flex-1 max-w-[420px]"
                    />
                    <button
                        type="button"
                        disabled={Boolean(normalizedTerm)}
                        onClick={expandAll}
                        className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-neutral-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={normalizedTerm ? 'Desactivado mientras buscás (los grupos se abren automáticamente)' : 'Expandir todos los grupos'}
                    >
                        Expandir
                    </button>
                    <button
                        type="button"
                        disabled={Boolean(normalizedTerm)}
                        onClick={collapseAll}
                        className="h-10 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold text-neutral-700 hover:border-orange-300 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={normalizedTerm ? 'Desactivado mientras buscás (los grupos se abren automáticamente)' : 'Contraer todos los grupos'}
                    >
                        Contraer
                    </button>
                    <button
                        type="button"
                        onClick={() => setZoomMode('plan')}
                        className={`h-10 px-3 rounded-lg border text-xs font-bold ${zoomMode === 'plan' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-gray-200 hover:border-orange-300 hover:text-orange-700'}`}
                        title="Ver plan completo"
                    >
                        Plan
                    </button>
                    <button
                        type="button"
                        disabled={!lastRealKey}
                        onClick={() => setZoomMode('toReal')}
                        className={`h-10 px-3 rounded-lg border text-xs font-bold ${zoomMode === 'toReal' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-gray-200 hover:border-orange-300 hover:text-orange-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={lastRealKey ? 'Zoom hasta el último mes con cargas' : 'No hay cargas'}
                    >
                        Hasta carga
                    </button>

                    <div className="ml-auto flex items-center gap-2">
                        <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest hidden md:block">
                            Vista
                        </div>
                        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setValueMode('pct')}
                                className={`h-10 px-3 text-xs font-bold ${valueMode === 'pct' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-gray-50'}`}
                                title="Ver porcentajes"
                            >
                                %
                            </button>
                            <button
                                type="button"
                                disabled={!canAnyQty}
                                onClick={() => setValueMode('qty')}
                                className={`h-10 px-3 text-xs font-bold ${valueMode === 'qty' ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-gray-50'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                title={canAnyQty ? 'Ver cantidades' : 'No hay cantidades/unidad disponibles'}
                            >
                                Cantidad
                            </button>
                        </div>
                    </div>
                </div>

                {plannedWindow?.startDate && plannedWindow?.endDate && (
                    <div className="text-[11px] text-neutral-500 mt-2">
                        Periodo estimado:{' '}
                        <span className="font-semibold text-neutral-700">
                            {fmtMonthLabel(monthKeyOfIso(plannedWindow.startDate))} - {fmtMonthLabel(monthKeyOfIso(plannedWindow.endDate))}
                        </span>
                    </div>
                )}
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-auto"
                onScroll={(e) => {
                    const el = e.currentTarget;
                    try {
                        localStorage.setItem(scrollPersistKey, JSON.stringify({ top: el.scrollTop, left: el.scrollLeft }));
                    } catch {
                        void 0;
                    }
                }}
            >
                {loading ? (
                    <div className="p-10 text-center text-neutral-400 text-sm">Cargando planificación…</div>
                ) : monthsToRender.length === 0 ? (
                    <div className="p-10 text-center text-neutral-400 text-sm">Sin períodos para mostrar.</div>
                ) : (
                    <div className="min-w-[900px]">
                        {/* Header */}
                        <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
                            <div className="flex">
                                <div className="w-[360px] shrink-0 px-4 py-2 text-[11px] font-bold text-neutral-500 uppercase tracking-widest">
                                    Ítems
                                </div>
                                <div className="flex-1 flex">
                                    {monthsToRender.map((m) => (
                                        <div key={m.key} className="w-[92px] shrink-0 px-2 py-2 text-[11px] font-bold text-neutral-500 text-center border-l border-gray-100">
                                            {fmtMonthLabel(m.key)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Rows */}
                        {renderRows.map((row, idx) => {
                            const node = row.node;
                            const padLeft = row.level === 0 ? 'pl-4' : row.level === 1 ? 'pl-8' : 'pl-12';

                            const isGroup = row.type === 'group';
                            const isSub = row.type === 'subgroup';
                            const isItem = row.type === 'item';

                            const rowBg = isGroup
                                ? 'bg-orange-100/80 hover:bg-orange-100'
                                : isSub
                                    ? 'bg-slate-100/70 hover:bg-slate-100/90'
                                    : 'bg-white hover:bg-gray-50/60';

                            const rowBorder = isGroup
                                ? 'border-b border-orange-200'
                                : isSub
                                    ? 'border-b border-slate-200'
                                    : 'border-b border-gray-100/70';

                            const rowAccent = isGroup
                                ? 'border-l-8 border-orange-500'
                                : isSub
                                    ? 'border-l-6 border-slate-300'
                                    : 'border-l-6 border-transparent';

                            const rowId = node?.id;
                            const displayName = node?.descripcion || '';
                            const code = node?.item || '';

                            const groupOpen = Boolean(normalizedTerm) || Boolean(expandedGroups[rowId]);
                            const subOpen = Boolean(normalizedTerm) || Boolean(expandedSubgroups[rowId]);

                            const rowItemIds = (() => {
                                if (isItem) return [rowId];
                                if (isSub) return (node?.items || []).map(i => i.id).filter(Boolean);
                                if (isGroup) {
                                    const ids = [];
                                    (node?.directItems || []).forEach(i => { if (i?.id) ids.push(i.id); });
                                    (node?.subgroups || []).forEach(s => (s?.items || []).forEach(i => { if (i?.id) ids.push(i.id); }));
                                    return ids;
                                }
                                return [];
                            })();

                            const rowQtyDisplayCtx = (() => {
                                if (!rowItemIds || rowItemIds.length === 0) return { canQty: false, unit: null };
                                let unit = null;
                                for (const id of rowItemIds) {
                                    const meta = itemById.get(String(id)) || {};
                                    const q = Number(meta?.cantidad);
                                    const u = meta?.unidad ? String(meta.unidad) : null;
                                    if (!u || !Number.isFinite(q) || q <= 0) return { canQty: false, unit: null };
                                    if (!unit) unit = u;
                                    else if (unit !== u) return { canQty: false, unit: null };
                                }
                                return { canQty: true, unit };
                            })();

                            const rowQtyCtx = valueMode === 'qty' ? rowQtyDisplayCtx : { canQty: false, unit: null };

                            const endKey = zoomMode === 'toReal' ? (lastRealKey || plannedEndKey) : plannedEndKey;
                            const endEstCum = endKey
                                ? (isItem ? cumPctUpTo(estByItemId, rowId, endKey) : aggCumPctUpTo(estByItemId, rowItemIds, endKey))
                                : 0;
                            const endRealCum = endKey
                                ? (isItem ? cumPctUpTo(realByItemId, rowId, endKey) : aggCumPctUpTo(realByItemId, rowItemIds, endKey))
                                : 0;
                            const endDiffCum = endRealCum - endEstCum;

                            const endEstCumQty = rowQtyDisplayCtx.canQty && endKey
                                ? rowItemIds.reduce((sum, id) => {
                                    const meta = itemById.get(String(id)) || {};
                                    const q = Number(meta?.cantidad) || 0;
                                    return sum + (q * cumPctUpTo(estByItemId, id, endKey) / 100);
                                }, 0)
                                : null;

                            const endRealCumQty = rowQtyDisplayCtx.canQty && endKey
                                ? rowItemIds.reduce((sum, id) => {
                                    const meta = itemById.get(String(id)) || {};
                                    const q = Number(meta?.cantidad) || 0;
                                    return sum + (q * cumPctUpTo(realByItemId, id, endKey) / 100);
                                }, 0)
                                : null;

                            return (
                                <div
                                    key={`${row.type}-${rowId}-${idx}`}
                                    className={`flex ${rowBorder} ${rowBg} ${rowAccent}`}
                                >
                                    <div className={`w-[360px] shrink-0 pr-3 py-2 ${padLeft}`}>
                                        {isGroup && (
                                            <button
                                                type="button"
                                                onClick={() => setExpandedGroups(prev => ({ ...prev, [rowId]: !prev[rowId] }))}
                                                className="w-full flex items-center justify-between gap-3 text-left"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {groupOpen ? <ChevronDown className="w-4 h-4 text-orange-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-neutral-300 shrink-0" />}
                                                    <span className="text-xs font-black text-neutral-800 uppercase tracking-wide truncate">{displayName}</span>
                                                </div>
                                                <div className="flex flex-col items-end shrink-0 leading-none">
                                                    <div className="text-[11px] font-black text-green-700">
                                                        R {endRealCum.toFixed(1)}%{rowQtyDisplayCtx.canQty && endRealCumQty !== null ? ` · ${fmtQty(endRealCumQty)} ${rowQtyDisplayCtx.unit}` : ''}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-orange-700">
                                                        E {endEstCum.toFixed(1)}%{rowQtyDisplayCtx.canQty && endEstCumQty !== null ? ` · ${fmtQty(endEstCumQty)} ${rowQtyDisplayCtx.unit}` : ''}
                                                        <span className={`ml-2 font-black ${endDiffCum >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                            Δ {endDiffCum >= 0 ? '+' : ''}{endDiffCum.toFixed(1)} pp
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        )}

                                        {isSub && (
                                            <button
                                                type="button"
                                                onClick={() => setExpandedSubgroups(prev => ({ ...prev, [rowId]: !prev[rowId] }))}
                                                className="w-full flex items-center gap-2 text-left"
                                            >
                                                {subOpen ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-300 shrink-0" />}
                                                <span className="text-xs font-bold text-neutral-600 uppercase tracking-wide truncate">{displayName}</span>
                                            </button>
                                        )}

                                        {isItem && (
                                            <button
                                                type="button"
                                                onClick={() => onItemClick?.({ ...itemById.get(String(rowId)), id_licitacion: projectId })}
                                                className="w-full text-left"
                                                title={displayName}
                                            >
                                                <div className="text-xs font-medium text-neutral-800 truncate">{displayName}</div>
                                                <div className="text-[10px] text-neutral-400 font-mono truncate">{code}</div>
                                                {(() => {
                                                    const endKey = zoomMode === 'toReal' ? (lastRealKey || plannedEndKey) : plannedEndKey;
                                                    if (!endKey) return null;
                                                    const estCum = cumPctUpTo(estByItemId, rowId, endKey);
                                                    const realCum = cumPctUpTo(realByItemId, rowId, endKey);
                                                    if ((estCum || 0) === 0 && (realCum || 0) === 0) return null;
                                                    const diff = realCum - estCum;

                                                    const meta = itemById.get(String(rowId)) || {};
                                                    const q = Number(meta?.cantidad) || 0;
                                                    const u = meta?.unidad ? String(meta.unidad) : '';
                                                    const canQty = valueMode === 'qty' && q > 0 && Boolean(u);
                                                    const estCumQty = canQty ? (q * estCum / 100) : null;
                                                    const realCumQty = canQty ? (q * realCum / 100) : null;
                                                    const diffQty = canQty ? ((realCumQty || 0) - (estCumQty || 0)) : null;
                                                    return (
                                                        <div className="text-[10px] text-neutral-500 mt-0.5 truncate">
                                                            Acum ({fmtMonthLabel(endKey)}):{' '}
                                                            {canQty ? (
                                                                <span className="font-semibold text-green-700">R {fmtQty(realCumQty)} {u}</span>
                                                            ) : (
                                                                <span className="font-semibold text-green-700">R {realCum.toFixed(1)}%</span>
                                                            )}{' '}
                                                            {canQty ? (
                                                                <span className="font-semibold text-orange-700">E {fmtQty(estCumQty)} {u}</span>
                                                            ) : (
                                                                <span className="font-semibold text-orange-700">E {estCum.toFixed(1)}%</span>
                                                            )}{' '}
                                                            <span className={`font-bold ${canQty ? ((diffQty || 0) >= 0 ? 'text-green-700' : 'text-red-700') : (diff >= 0 ? 'text-green-700' : 'text-red-700')}`}>
                                                                Δ {canQty ? ((diffQty || 0) >= 0 ? '+' : '') : (diff >= 0 ? '+' : '')}{canQty ? `${fmtQty(diffQty)} ${u}` : `${diff.toFixed(1)} pp`}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </button>
                                        )}
                                    </div>

                                    <div className="flex-1 flex">
                                        {monthsToRender.map((m) => {
                                            const est = isItem ? getPct(estByItemId, rowId, m.key) : aggPctForMonth(estByItemId, rowItemIds, m.key);
                                            const real = isItem ? getPct(realByItemId, rowId, m.key) : aggPctForMonth(realByItemId, rowItemIds, m.key);
                                            const diff = real - est;
                                            const estCum = isItem ? cumPctUpTo(estByItemId, rowId, m.key) : aggCumPctUpTo(estByItemId, rowItemIds, m.key);
                                            const realCum = isItem ? cumPctUpTo(realByItemId, rowId, m.key) : aggCumPctUpTo(realByItemId, rowItemIds, m.key);

                                            const itemMeta = isItem ? (itemById.get(String(rowId)) || {}) : null;
                                            const totalQty = isItem ? (Number(itemMeta?.cantidad) || 0) : 0;
                                            const unit = isItem && itemMeta?.unidad ? String(itemMeta.unidad) : '';
                                            const estQty = isItem && totalQty > 0 ? (totalQty * est / 100) : null;
                                            const realQty = isItem && totalQty > 0 ? (totalQty * real / 100) : null;
                                            const estCumQty = isItem && totalQty > 0 ? (totalQty * estCum / 100) : null;
                                            const realCumQty = isItem && totalQty > 0 ? (totalQty * realCum / 100) : null;

                                            const rowEstQty = rowQtyCtx.canQty
                                                ? rowItemIds.reduce((sum, id) => {
                                                    const meta = itemById.get(String(id)) || {};
                                                    const q = Number(meta?.cantidad) || 0;
                                                    return sum + (q * getPct(estByItemId, id, m.key) / 100);
                                                }, 0)
                                                : null;

                                            const rowRealQty = rowQtyCtx.canQty
                                                ? rowItemIds.reduce((sum, id) => {
                                                    const meta = itemById.get(String(id)) || {};
                                                    const q = Number(meta?.cantidad) || 0;
                                                    return sum + (q * getPct(realByItemId, id, m.key) / 100);
                                                }, 0)
                                                : null;

                                            const rowEstCumQty = rowQtyCtx.canQty
                                                ? rowItemIds.reduce((sum, id) => {
                                                    const meta = itemById.get(String(id)) || {};
                                                    const q = Number(meta?.cantidad) || 0;
                                                    return sum + (q * cumPctUpTo(estByItemId, id, m.key) / 100);
                                                }, 0)
                                                : null;

                                            const rowRealCumQty = rowQtyCtx.canQty
                                                ? rowItemIds.reduce((sum, id) => {
                                                    const meta = itemById.get(String(id)) || {};
                                                    const q = Number(meta?.cantidad) || 0;
                                                    return sum + (q * cumPctUpTo(realByItemId, id, m.key) / 100);
                                                }, 0)
                                                : null;

                                            const cellHeightClass = isItem ? 'h-2.5' : 'h-2';

                                            return (
                                                <div
                                                    key={`${row.type}-${rowId}-${m.key}`}
                                                    className="w-[92px] shrink-0 border-l border-gray-100 px-2 py-2"
                                                    onMouseLeave={hideTooltip}
                                                >
                                                    <div
                                                        className="space-y-1"
                                                        onMouseMove={(e) => showTooltip(e, `${code} ${displayName}`.trim(), [
                                                            `Mes: ${fmtMonthLabel(m.key)}`,
                                                            `${isItem ? 'Ítem' : isGroup ? 'Grupo' : 'Subgrupo'}: ${isItem ? (code || '-') : ''}`.trim(),
                                                            valueMode === 'qty' && rowQtyCtx.canQty
                                                                ? `Estimado mes: ${fmtQty(rowEstQty)} ${rowQtyCtx.unit} (${est.toFixed(2)}%)`
                                                                : `Estimado mes: ${est.toFixed(2)}%${estQty !== null ? ` (${estQty.toLocaleString('es-AR')} ${unit})` : ''}`,
                                                            valueMode === 'qty' && rowQtyCtx.canQty
                                                                ? `Real mes: ${fmtQty(rowRealQty)} ${rowQtyCtx.unit} (${real.toFixed(2)}%)`
                                                                : `Real mes: ${real.toFixed(2)}%${realQty !== null ? ` (${realQty.toLocaleString('es-AR')} ${unit})` : ''}`,
                                                            `Δ mes: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} pp`,
                                                            valueMode === 'qty' && rowQtyCtx.canQty
                                                                ? `Estimado acum: ${fmtQty(rowEstCumQty)} ${rowQtyCtx.unit} (${estCum.toFixed(2)}%)`
                                                                : `Estimado acum: ${estCum.toFixed(2)}%${estCumQty !== null ? ` (${estCumQty.toLocaleString('es-AR')} ${unit})` : ''}`,
                                                            valueMode === 'qty' && rowQtyCtx.canQty
                                                                ? `Real acum: ${fmtQty(rowRealCumQty)} ${rowQtyCtx.unit} (${realCum.toFixed(2)}%)`
                                                                : `Real acum: ${realCum.toFixed(2)}%${realCumQty !== null ? ` (${realCumQty.toLocaleString('es-AR')} ${unit})` : ''}`,
                                                            `Δ acum: ${(realCum - estCum) >= 0 ? '+' : ''}${(realCum - estCum).toFixed(2)} pp`,
                                                            valueMode === 'qty' && !rowQtyCtx.canQty ? 'Cantidad no disponible (unidades mixtas o falta cantidad).' : null
                                                        ].filter(Boolean))}
                                                    >
                                                        {/* Estimado (arriba) */}
                                                        <div className={`${cellHeightClass} w-full rounded-md bg-orange-50 relative overflow-hidden`}>
                                                            <div
                                                                className="absolute inset-y-0 left-0 bg-orange-500/80"
                                                                style={{ width: `${Math.min(100, Math.max(0, est))}%` }}
                                                            />
                                                        </div>
                                                        {/* Real (abajo) */}
                                                        <div className={`${cellHeightClass} w-full rounded-md bg-green-50 relative overflow-hidden ${real > est ? 'ring-1 ring-green-500/40' : ''}`}>
                                                            <div
                                                                className="absolute inset-y-0 left-0 bg-green-500"
                                                                style={{ width: `${Math.min(100, Math.max(0, real))}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {(est > 0 || real > 0) && (
                                                        <div className="mt-1 text-[10px] leading-none flex items-center justify-between gap-1">
                                                            <span className="font-bold text-green-700 truncate">
                                                                {valueMode === 'qty' && rowQtyCtx.canQty ? `R ${fmtQty(rowRealQty)} ${rowQtyCtx.unit}` : `R ${real.toFixed(0)}%`}
                                                            </span>
                                                            <span className="text-neutral-300">/</span>
                                                            <span className="font-bold text-orange-700 truncate">
                                                                {valueMode === 'qty' && rowQtyCtx.canQty ? `E ${fmtQty(rowEstQty)} ${rowQtyCtx.unit}` : `E ${est.toFixed(0)}%`}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {tooltip && (
                <div
                    className="fixed z-[80] bg-neutral-900 text-white text-xs rounded-lg p-2 shadow-2xl border border-neutral-800 pointer-events-none w-[240px]"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    <div className="font-bold mb-1 line-clamp-2">{tooltip.title}</div>
                    <div className="space-y-0.5 text-neutral-200">
                        {(tooltip.lines || []).map((t, i) => (
                            <div key={i}>{t}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
