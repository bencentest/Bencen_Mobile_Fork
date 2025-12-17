import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { Loader2, ArrowLeft, Ruler, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { ProgressModal } from './ProgressModal';
import { HistoryModal } from './HistoryModal';

export function ItemsList({ project, onBack }) {
    const [items, setItems] = useState([]);
    const [progressMap, setProgressMap] = useState(new Map());
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState({});

    // Unified Flow: Just selecting item to see history/add
    const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

    useEffect(() => {
        if (project?.id_licitacion) {
            setLoading(true);

            Promise.all([
                api.getItems(project.id_licitacion),
                api.getActiveItemIds(project.id_licitacion)
            ])
                .then(([itemsData, progressData]) => {
                    setItems(itemsData);
                    setProgressMap(progressData); // Now it's a Map
                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, [project]);

    // Grouping Logic calculation
    const groupedData = useMemo(() => {
        const groups = [];
        let currentGroup = null;
        let currentSubgroup = null;

        items.forEach((row) => {
            // Get Progress
            const progress = progressMap.get(String(row.id)) || progressMap.get(Number(row.id)) || 0;
            const isComplete = progress >= 99.9; // Tolerance for float math
            const hasProgress = progress > 0;

            const itemWithStatus = { ...row, hasProgress, isComplete, progress };

            // Level 1: Group
            if (row.grupo) {
                currentGroup = { ...row, subgroups: [], directItems: [], hasProgress: false, isComplete: true }; // Default complete true, will be falsified by children
                groups.push(currentGroup);
                currentSubgroup = null;
            }
            // Level 2: Subgroup
            else if (row.subgrupo) {
                currentSubgroup = { ...row, items: [], hasProgress: false, isComplete: true };
                if (currentGroup) {
                    currentGroup.subgroups.push(currentSubgroup);
                }
            }
            // Level 3: Item
            else {
                if (currentSubgroup) {
                    currentSubgroup.items.push(itemWithStatus);
                    if (hasProgress) currentSubgroup.hasProgress = true;
                    if (hasProgress && currentGroup) currentGroup.hasProgress = true;
                    if (!isComplete) currentSubgroup.isComplete = false;
                } else if (currentGroup) {
                    currentGroup.directItems.push(itemWithStatus);
                    if (hasProgress) currentGroup.hasProgress = true;
                    if (!isComplete) currentGroup.isComplete = false;
                }
            }
        });

        // Bubble up completion for groups based on subgroups
        groups.forEach(g => {
            if (g.subgroups.some(s => !s.isComplete)) g.isComplete = false;
            // Edge case: Empty group/subgroup? Assuming data is good.
            if (g.directItems.length === 0 && g.subgroups.length === 0) g.isComplete = false; // Don't mark empty as complete
            g.subgroups.forEach(s => {
                if (s.items.length === 0) s.isComplete = false;
            })
        });

        // Search Filter
        if (!searchTerm) return groups;

        const term = searchTerm.toLowerCase();

        return groups.map(group => {
            const matchesGroup = group.descripcion?.toLowerCase().includes(term);

            const matchingSubgroups = group.subgroups.map(sub => {
                const matchesSub = sub.descripcion?.toLowerCase().includes(term);
                const matchingItems = sub.items.filter(i =>
                    i.item?.toLowerCase().includes(term) ||
                    i.descripcion?.toLowerCase().includes(term)
                );

                if (matchesSub || matchingItems.length > 0) {
                    return { ...sub, items: matchesSub ? sub.items : matchingItems };
                }
                return null;
            }).filter(Boolean);

            const matchingDirectItems = group.directItems.filter(i =>
                i.item?.toLowerCase().includes(term) ||
                i.descripcion?.toLowerCase().includes(term)
            );

            if (matchesGroup || matchingSubgroups.length > 0 || matchingDirectItems.length > 0) {
                return {
                    ...group,
                    subgroups: matchesGroup ? group.subgroups : matchingSubgroups,
                    directItems: matchesGroup ? group.directItems : matchingDirectItems
                };
            }
            return null;
        }).filter(Boolean);

    }, [items, progressMap, searchTerm]);

    const toggleGroup = (groupId) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const handleItemClick = (item) => {
        // Unified Flow: Always open history first, which allows adding
        setViewingHistoryItem(item);
    };

    const refreshActiveIds = () => {
        if (project?.id_licitacion) {
            api.getActiveItemIds(project.id_licitacion).then(ids => setActiveIds(new Set(ids)));
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
                <Loader2 className="w-8 h-8 animate-spin mb-2 text-[var(--accent)]" />
                <p>Cargando plan de trabajo...</p>
            </div>
        );
    }

    return (
        <div className='flex flex-col h-full bg-white'>
            {/* Sticky Header */}
            <div className="bg-white border-b border-[var(--border)] sticky top-0 z-10 shadow-sm">
                <div className="flex items-center gap-2 p-4 pb-2">
                    <button
                        onClick={onBack}
                        className="p-2 -ml-2 text-neutral-600 hover:text-[var(--accent)] rounded-full hover:bg-neutral-100"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-neutral-900 leading-tight">
                            Items de Obra
                        </h2>
                        <p className="text-xs text-[var(--muted)] truncate max-w-[250px]">{project?.nombre_abreviado}</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-4 pb-3">
                    <input
                        type="text"
                        placeholder="Buscar item..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg bg-gray-100 border-transparent focus:bg-white focus:border-[var(--accent)] focus:ring-[var(--accent)] text-sm transition-all placeholder:text-gray-400"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-auto pb-20 p-2 space-y-2">
                {groupedData.length === 0 ? (
                    <div className="text-center py-12 text-[var(--muted)]">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>{searchTerm ? "No se encontraron resultados." : "No hay items cargados para esta obra."}</p>
                    </div>
                ) : groupedData.map((group) => {
                    // Force open if searching, otherwise stick to state
                    const isOpen = searchTerm ? true : (expandedGroups[group.id] === undefined ? false : expandedGroups[group.id]);

                    return (
                        <div key={group.id} className="rounded-lg overflow-hidden border border-[var(--border)] bg-white">
                            {/* Level 1: Group Header */}
                            <button
                                onClick={() => toggleGroup(group.id)}
                                className="w-full flex items-center justify-between p-3 bg-neutral-100/80 hover:bg-neutral-100 transition-colors text-left border-b border-transparent data-[open=true]:border-[var(--border-hair)]"
                                data-open={isOpen}
                            >
                                <div className="flex items-center gap-2 font-bold text-neutral-800 text-sm overflow-hidden flex-1">
                                    {isOpen ? <ChevronDown className="w-4 h-4 text-[var(--accent)] shrink-0" /> : <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />}
                                    <span className="uppercase tracking-wide truncate">{group.descripcion}</span>
                                </div>

                                {group.isComplete ? (
                                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-200 shrink-0 ml-2">
                                        COMPLETO
                                    </span>
                                ) : group.hasProgress && (
                                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 ml-2 shadow-sm"></span>
                                )}
                            </button>

                            {/* Group Content */}
                            {isOpen && (
                                <div className="bg-white pb-2">
                                    {/* Direct Items */}
                                    {group.directItems && group.directItems.map(item => (
                                        <ItemRow key={item.id} item={item} onClick={() => handleItemClick(item)} />
                                    ))}

                                    {/* Level 2: Subgroups */}
                                    {group.subgroups && group.subgroups.map(subgroup => (
                                        <div key={subgroup.id} className="mt-1">
                                            <div className="px-3 py-2 bg-orange-50/50 border-y border-[var(--border-hair)] flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-300 shrink-0"></div>
                                                    <span className="text-xs font-bold text-neutral-700 uppercase tracking-tight truncate">{subgroup.descripcion}</span>
                                                </div>

                                                {subgroup.isComplete ? (
                                                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-200 shrink-0 ml-2">
                                                        COMPLETO
                                                    </span>
                                                ) : subgroup.hasProgress && (
                                                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 ml-1 shadow-sm"></span>
                                                )}
                                            </div>

                                            {/* Level 3: Subgroup Items */}
                                            <div className="divide-y divide-[var(--border-hair)]">
                                                {subgroup.items && subgroup.items.map(item => (
                                                    <ItemRow key={item.id} item={item} onClick={() => handleItemClick(item)} />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ... */}



            {viewingHistoryItem && (
                <HistoryModal
                    item={viewingHistoryItem}
                    onClose={() => setViewingHistoryItem(null)}
                    onUpdate={refreshActiveIds}
                />
            )}
        </div>
    );
}

function ItemRow({ item, onClick }) {
    return (
        <div
            onClick={onClick}
            className={`p-3 pl-4 transition-colors flex flex-col gap-1 cursor-pointer hover:bg-gray-50 border-l-4 ${item.isComplete ? 'bg-green-50/50 border-green-500' : 'bg-white border-transparent'}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex gap-2">
                    <span className="font-mono font-bold text-xs text-[var(--accent)] pt-0.5 min-w-[30px]">{item.item}</span>
                    <span className="text-sm text-neutral-700 leading-snug">{item.descripcion}</span>
                </div>

                {item.isComplete ? (
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-200 shrink-0 shadow-sm">
                        COMPLETO
                    </span>
                ) : item.hasProgress && (
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 shadow-sm border border-white"></span>
                )}
            </div>
            <div className="pl-[38px] flex items-center gap-4 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100">
                    <Ruler className="w-3 h-3" />
                    {Number(item.cantidad).toLocaleString('es-AR')} {item.unidad}
                </span>
                {item.progress > 0 && <span className="font-bold text-green-600">{item.progress.toFixed(2)}%</span>}
            </div>
        </div>
    );
}
