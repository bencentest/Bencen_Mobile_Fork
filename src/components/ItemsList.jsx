import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import { Loader2, ArrowLeft, Ruler, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { ProgressModal } from './ProgressModal';
import { HistoryModal } from './HistoryModal';

export function ItemsList({ project, onBack, mode = 'add' }) { // mode: 'add' | 'history'
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState({});

    // We use two separate states or one state with a type? 
    // Let's use one state 'activeItem' and handle logic based on 'mode'
    // BUT user wants to jump from History to Add. 
    // So we need: 
    // viewingHistoryItem -> shows HistoryModal
    // addingProgressItem -> shows ProgressModal

    const [viewingHistoryItem, setViewingHistoryItem] = useState(null);
    const [addingProgressItem, setAddingProgressItem] = useState(null);

    // ... (useEffect remains same) ...

    useEffect(() => {
        if (project?.id_licitacion) {
            setLoading(true);
            api.getItems(project.id_licitacion)
                .then(data => {
                    setItems(data);
                    // No default expansion or maybe yes?
                    setLoading(false);
                })
                .catch(err => {
                    console.error(err);
                    setLoading(false);
                });
        }
    }, [project]);

    // ... (grouping logic remains same) ...
    const groupedData = useMemo(() => {
        const groups = [];
        let currentGroup = null;
        let currentSubgroup = null;

        items.forEach((row) => {
            // Level 1: Group
            if (row.grupo) {
                currentGroup = { ...row, subgroups: [], directItems: [] };
                groups.push(currentGroup);
                currentSubgroup = null;
            }
            // Level 2: Subgroup
            else if (row.subgrupo) {
                currentSubgroup = { ...row, items: [] };
                if (currentGroup) {
                    currentGroup.subgroups.push(currentSubgroup);
                }
            }
            // Level 3: Item
            else {
                if (currentSubgroup) {
                    currentSubgroup.items.push(row);
                } else if (currentGroup) {
                    currentGroup.directItems.push(row);
                }
            }
        });
        return groups;
    }, [items]);

    const toggleGroup = (groupId) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupId]: !prev[groupId]
        }));
    };

    const handleItemClick = (item) => {
        if (mode === 'add') {
            setAddingProgressItem(item);
        } else {
            setViewingHistoryItem(item);
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
            <div className="flex items-center gap-2 p-4 bg-white border-b border-[var(--border)] sticky top-0 z-10 shadow-sm">
                <button
                    onClick={onBack}
                    className="p-2 -ml-2 text-neutral-600 hover:text-[var(--accent)] rounded-full hover:bg-neutral-100"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div>
                    <h2 className="text-lg font-bold text-neutral-900 leading-tight">
                        {mode === 'add' ? 'Cargar Avance' : 'Estado Actual'}
                    </h2>
                    <p className="text-xs text-[var(--muted)] truncate max-w-[250px]">{project?.nombre_abreviado}</p>
                </div>
            </div>

            <div className="flex-1 overflow-auto pb-20 p-2 space-y-2">
                {groupedData.length === 0 ? (
                    <div className="text-center py-12 text-[var(--muted)]">
                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No hay items cargados para esta obra.</p>
                    </div>
                ) : groupedData.map((group) => {
                    const isExpanded = expandedGroups[group.id] !== false;
                    const isOpen = expandedGroups[group.id] === undefined ? false : expandedGroups[group.id];

                    return (
                        <div key={group.id} className="rounded-lg overflow-hidden border border-[var(--border)] bg-white">
                            {/* Level 1: Group Header */}
                            <button
                                onClick={() => toggleGroup(group.id)}
                                className="w-full flex items-center justify-between p-3 bg-neutral-100/80 hover:bg-neutral-100 transition-colors text-left border-b border-transparent data-[open=true]:border-[var(--border-hair)]"
                                data-open={isOpen}
                            >
                                <div className="flex items-center gap-2 font-bold text-neutral-800 text-sm">
                                    {isOpen ? <ChevronDown className="w-4 h-4 text-[var(--accent)]" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
                                    <span className="uppercase tracking-wide line-clamp-1">{group.descripcion}</span>
                                </div>
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
                                            <div className="px-3 py-2 bg-orange-50/50 border-y border-[var(--border-hair)] flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-orange-300"></div>
                                                <span className="text-xs font-bold text-neutral-700 uppercase tracking-tight">{subgroup.descripcion}</span>
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

            {addingProgressItem && (
                <ProgressModal
                    item={addingProgressItem}
                    onClose={() => setAddingProgressItem(null)}
                    onSuccess={() => {
                        // Keep open? close? For now close.
                    }}
                />
            )}

            {viewingHistoryItem && (
                <HistoryModal
                    item={viewingHistoryItem}
                    onClose={() => setViewingHistoryItem(null)}
                    onAddProgress={() => {
                        // Switch from History to Add logic
                        const itm = viewingHistoryItem;
                        setViewingHistoryItem(null); // Close history
                        setTimeout(() => setAddingProgressItem(itm), 200); // Open add
                    }}
                />
            )}
        </div>
    );
}

function ItemRow({ item, onClick }) {
    return (
        <div
            onClick={onClick}
            className="p-3 pl-4 active:bg-orange-50 transition-colors flex flex-col gap-1 cursor-pointer hover:bg-gray-50 bg-white"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex gap-2">
                    <span className="font-mono font-bold text-xs text-[var(--accent)] pt-0.5 min-w-[30px]">{item.item}</span>
                    <span className="text-sm text-neutral-700 leading-snug">{item.descripcion}</span>
                </div>
            </div>
            <div className="pl-[38px] flex items-center gap-4 text-xs text-[var(--muted)]">
                <span className="flex items-center gap-1 bg-neutral-50 px-2 py-0.5 rounded border border-neutral-100">
                    <Ruler className="w-3 h-3" />
                    {Number(item.cantidad).toLocaleString('es-AR')} {item.unidad}
                </span>
            </div>
        </div>
    );
}
