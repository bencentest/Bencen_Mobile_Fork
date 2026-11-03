import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarClock, AlertTriangle, Activity, RefreshCw, Search, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { usePersistentState } from '../../hooks/usePersistentState';

const DELAY_PP = -10;
const WATCH_PP = -3;
const STALE_DAYS = 7;

const dayMs = 24 * 60 * 60 * 1000;

function daysSince(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((today - day) / dayMs);
}

function fmtRelative(iso) {
    const days = daysSince(iso);
    if (days === null) return 'Sin reportes';
    if (days <= 0) return `Hoy ${new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
    if (days === 1) return 'Ayer';
    return `Hace ${days} días`;
}

function fmtMonth(iso) {
    if (!iso) return '';
    const [y, m] = iso.split('-');
    return `${m}/${y.slice(2)}`;
}

function fmtPct(v) {
    return `${(Number(v) || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

function fmtPp(v) {
    const n = Number(v) || 0;
    return `${n > 0 ? '+' : ''}${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} pp`;
}

const STATUS = {
    delayed: { label: 'Atrasada', dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-100', delta: 'text-red-600' },
    watch: { label: 'Atención', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-100', delta: 'text-amber-600' },
    ok: { label: 'En plan', dot: 'bg-green-500', badge: 'bg-green-50 text-green-700 border-green-100', delta: 'text-green-600' },
    noPlan: { label: 'Sin plan', dot: 'bg-neutral-300', badge: 'bg-neutral-50 text-neutral-500 border-neutral-200', delta: 'text-neutral-400' }
};

function buildRow(project, weightMode) {
    const usesCost = weightMode === 'cost' && project.hasCosts;
    const values = usesCost ? project.byCost : project.byItems;
    const delta = values.real - values.plan;
    const status = !project.hasPlan ? 'noPlan' : delta <= DELAY_PP ? 'delayed' : delta <= WATCH_PP ? 'watch' : 'ok';
    const staleDays = daysSince(project.lastReportAt);
    return {
        ...project,
        real: values.real,
        plan: values.plan,
        delta,
        status,
        costFallback: weightMode === 'cost' && !project.hasCosts,
        isStale: staleDays === null || staleDays > STALE_DAYS
    };
}

export function PortfolioHome({ currentUserId, refreshTrigger, onOpenProject }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [search, setSearch] = useState('');

    const keyPrefix = currentUserId ? `bencen_${currentUserId}_admin_home` : null;
    const [weightMode, setWeightMode] = usePersistentState(keyPrefix ? `${keyPrefix}_weight` : null, 'cost');
    const [filter, setFilter] = usePersistentState(keyPrefix ? `${keyPrefix}_filter` : null, 'all');
    const [sortBy, setSortBy] = usePersistentState(keyPrefix ? `${keyPrefix}_sort` : null, 'delta');

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            setError(null);
            try {
                const res = await api.getPortfolioOverview();
                if (!cancelled) setData(res);
            } catch (e) {
                if (!cancelled) setError(e?.message || 'No se pudo cargar el resumen de obras.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [reloadKey, refreshTrigger]);

    const rows = useMemo(() => (data?.projects || []).map(p => buildRow(p, weightMode)), [data, weightMode]);

    const kpis = useMemo(() => ({
        active: rows.length,
        reports7d: rows.reduce((sum, r) => sum + r.reports7d, 0),
        stale: rows.filter(r => r.isStale).length,
        delayed: rows.filter(r => r.status === 'delayed').length
    }), [rows]);

    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        const filtered = rows.filter(r => {
            if (term && !String(r.nombre_abreviado || '').toLowerCase().includes(term)) return false;
            if (filter === 'delayed') return r.status === 'delayed' || r.status === 'watch';
            if (filter === 'stale') return r.isStale;
            return true;
        });
        const byName = (a, b) => String(a.nombre_abreviado || '').localeCompare(String(b.nombre_abreviado || ''), 'es');
        return filtered.sort((a, b) => {
            if (sortBy === 'name') return byName(a, b);
            if (sortBy === 'recent') return String(b.lastReportAt || '').localeCompare(String(a.lastReportAt || '')) || byName(a, b);
            // Worst deviation first; obras without plan go last.
            if (a.hasPlan !== b.hasPlan) return a.hasPlan ? -1 : 1;
            return (a.delta - b.delta) || byName(a, b);
        });
    }, [rows, search, filter, sortBy]);

    const filters = [
        { id: 'all', label: 'Todas', count: kpis.active },
        { id: 'delayed', label: 'Con desvío', count: rows.filter(r => r.status === 'delayed' || r.status === 'watch').length },
        { id: 'stale', label: `Sin reportes +${STALE_DAYS}d`, count: kpis.stale }
    ];

    return (
        <div className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiTile icon={Building2} label="Obras activas" value={kpis.active} tone="neutral" />
                <KpiTile icon={Activity} label="Reportes últimos 7 días" value={kpis.reports7d} tone="neutral" />
                <KpiTile icon={CalendarClock} label={`Sin reportes +${STALE_DAYS} días`} value={kpis.stale} tone={kpis.stale > 0 ? 'amber' : 'neutral'} onClick={() => setFilter('stale')} />
                <KpiTile icon={AlertTriangle} label={`Atrasadas (≤ ${DELAY_PP} pp)`} value={kpis.delayed} tone={kpis.delayed > 0 ? 'red' : 'neutral'} onClick={() => setFilter('delayed')} />
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 h-10 md:w-64">
                    <Search className="w-4 h-4 text-neutral-400 shrink-0" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar obra..."
                        className="w-full bg-transparent text-sm outline-none"
                    />
                </div>

                <div className="flex gap-1 overflow-x-auto">
                    {filters.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setFilter(f.id)}
                            className={`h-10 px-3 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors ${filter === f.id ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-gray-200 hover:border-orange-300'}`}
                        >
                            {f.label} <span className={filter === f.id ? 'text-orange-300' : 'text-neutral-400'}>{f.count}</span>
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2 md:ml-auto">
                    <div className="flex p-1 bg-gray-100 rounded-xl" title="Cómo se pondera el avance de cada obra">
                        {[{ id: 'cost', label: 'Por $' }, { id: 'items', label: 'Por ítems' }].map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => setWeightMode(opt.id)}
                                className={`h-8 px-3 rounded-lg text-xs font-bold transition-colors ${weightMode === opt.id ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="h-10 px-2 rounded-xl border border-gray-200 bg-white text-xs font-bold text-neutral-700 outline-none"
                        title="Ordenar"
                    >
                        <option value="delta">Mayor desvío</option>
                        <option value="recent">Último reporte</option>
                        <option value="name">Nombre</option>
                    </select>
                    <button
                        type="button"
                        onClick={() => setReloadKey(k => k + 1)}
                        className="h-10 w-10 shrink-0 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-neutral-500 hover:text-orange-600"
                        title={data?.generatedAt ? `Actualizado ${new Date(data.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : 'Actualizar'}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Cards */}
            {error ? (
                <div className="bg-red-50 text-red-700 text-sm p-4 rounded-xl border border-red-100">{error}</div>
            ) : loading && !data ? (
                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {[0, 1, 2, 3].map(i => <div key={i} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />)}
                </div>
            ) : visibleRows.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-neutral-400">
                    {rows.length === 0 ? 'No hay obras activas.' : 'Ninguna obra coincide con el filtro.'}
                </div>
            ) : (
                <div className={`grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3 ${loading ? 'opacity-60' : ''}`}>
                    {visibleRows.map(row => (
                        <ProjectCard key={row.id_licitacion} row={row} onOpen={() => onOpenProject(row.id_licitacion)} />
                    ))}
                </div>
            )}
        </div>
    );
}

function KpiTile({ icon, label, value, tone, onClick }) {
    const Icon = icon;
    const tones = {
        neutral: 'bg-neutral-100 text-neutral-600',
        amber: 'bg-amber-100 text-amber-700',
        red: 'bg-red-100 text-red-700'
    };
    const Tag = onClick ? 'button' : 'div';

    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={`bg-white p-3 rounded-xl border border-gray-200 flex items-center gap-3 text-left ${onClick ? 'hover:border-orange-200 transition-colors' : ''}`}
        >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${tones[tone] || tones.neutral}`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-wide leading-tight">{label}</p>
                <p className="text-xl font-black text-neutral-900">{value}</p>
            </div>
        </Tag>
    );
}

function ProgressBar({ value, className }) {
    return (
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
            <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.min(100, Math.max(0, Number(value) || 0))}%` }} />
        </div>
    );
}

function ProjectCard({ row, onOpen }) {
    const status = STATUS[row.status];
    const maxActivity = Math.max(1, ...row.activity);

    return (
        <button
            type="button"
            onClick={onOpen}
            className="group bg-white rounded-2xl border border-gray-200 p-4 text-left hover:border-orange-300 hover:shadow-md transition-all flex flex-col gap-3"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="font-bold text-neutral-900 truncate">{row.nombre_abreviado}</h3>
                    <p className="text-[11px] text-neutral-400">
                        {row.itemCount} ítems
                        {row.planStart && row.planEnd ? ` · Plan ${fmtMonth(row.planStart)} → ${fmtMonth(row.planEnd)}` : ''}
                    </p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${status.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                </span>
            </div>

            <div className="space-y-2">
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold text-neutral-700">Real</span>
                        <span className="font-black text-neutral-900">{fmtPct(row.real)}</span>
                    </div>
                    <ProgressBar value={row.real} className="bg-orange-500" />
                </div>
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="font-bold text-neutral-500">Plan a hoy</span>
                        <span className="font-bold text-neutral-500">{row.hasPlan ? fmtPct(row.plan) : '—'}</span>
                    </div>
                    <ProgressBar value={row.plan} className="bg-neutral-400" />
                </div>
            </div>

            <div className="flex items-end justify-between gap-3 pt-1 border-t border-gray-100">
                <div className="min-w-0 pt-2">
                    <p className={`text-lg font-black leading-none ${status.delta}`}>{row.hasPlan ? fmtPp(row.delta) : '—'}</p>
                    <p className={`text-[11px] mt-1 truncate ${row.isStale ? 'text-amber-600 font-bold' : 'text-neutral-500'}`}>
                        {fmtRelative(row.lastReportAt)}
                        {row.lastReporter?.name ? ` · ${row.lastReporter.name}` : ''}
                    </p>
                    {row.costFallback && <p className="text-[10px] text-neutral-400 mt-0.5">Sin precios: ponderado por ítems</p>}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1 pt-2">
                    <div className="flex items-end gap-[2px] h-8" title="Reportes por día, últimos 14 días">
                        {row.activity.map((n, i) => (
                            <div
                                key={i}
                                className={`w-1.5 rounded-sm ${n > 0 ? 'bg-orange-400' : 'bg-gray-100'}`}
                                style={{ height: `${n > 0 ? Math.max(15, (n / maxActivity) * 100) : 12}%` }}
                            />
                        ))}
                    </div>
                    <span className="text-[10px] text-neutral-400 flex items-center gap-0.5">
                        {row.reports7d} rep. 7d
                        <ChevronRight className="w-3 h-3 text-neutral-300 group-hover:text-orange-500 transition-colors" />
                    </span>
                </div>
            </div>
        </button>
    );
}
