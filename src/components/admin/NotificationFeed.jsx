import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Clock, Loader2, ArrowRight } from 'lucide-react';

export function NotificationFeed({ refreshTrigger }) {
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    const formatActivityDateTime = (value) => {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';

        const now = new Date();
        const isToday =
            date.getFullYear() === now.getFullYear() &&
            date.getMonth() === now.getMonth() &&
            date.getDate() === now.getDate();

        const timeText = date.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (isToday) return timeText;

        const dateText = date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit'
        });

        return `${dateText} ${timeText}`;
    };

    const formatPercent = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return '0%';
        return `${num.toLocaleString('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}%`;
    };

    useEffect(() => {
        let cancelled = false;

        const fetchActivity = async () => {
            const data = await api.getRecentActivity(15);
            if (cancelled) return;
            setActivities(data);
            setLoading(false);
        };

        void fetchActivity();
        const interval = setInterval(() => {
            void fetchActivity();
        }, 60000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [refreshTrigger]);

    if (loading) {
        return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-500" /></div>;
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-full flex flex-col">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-neutral-800 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    Actividad Reciente
                </h3>
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">En vivo</span>
            </div>

            <div className="flex-1 overflow-y-auto p-0">
                {activities.length === 0 ? (
                    <div className="p-8 text-center text-gray-400 text-sm">No hay actividad reciente.</div>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {activities.map((act) => (
                            <div key={act.id} className="p-4 hover:bg-gray-50 transition-colors group">
                                <div className="flex items-start gap-3">
                                    <div className="mt-1">
                                        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs uppercase">
                                            {act.reporter?.name?.substring(0, 2) || 'VN'}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-0.5">
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                                                {act.project_name || 'Obra Desconocida'}
                                            </span>
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                                {formatActivityDateTime(act.created_at)}
                                            </span>
                                        </div>

                                        <p className="text-xs font-bold text-neutral-900 truncate">
                                            {act.reporter?.name || act.reporter?.email}
                                        </p>

                                        <p className="text-sm text-neutral-600 mt-0.5 leading-snug">
                                            Reporto <span className="font-bold text-green-600">{formatPercent(act.avance)}</span> en <span className="text-neutral-800 font-medium">"{act.item_detail.descripcion}"</span>
                                        </p>

                                        {act.observaciones && (
                                            <p className="text-xs text-gray-400 italic mt-1 line-clamp-2 pl-2 border-l-2 border-gray-100">
                                                "{act.observaciones}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="p-3 border-t border-gray-100 bg-gray-50 text-center">
                <button className="text-xs font-bold text-neutral-500 hover:text-orange-600 flex items-center justify-center gap-1 w-full">
                    Ver todo el historial <ArrowRight className="w-3 h-3" />
                </button>
            </div>
        </div>
    );
}
