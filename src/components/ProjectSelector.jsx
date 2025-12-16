import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Building2, ChevronRight, Loader2 } from 'lucide-react';

export function ProjectSelector({ onSelect }) {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.getLicitaciones()
            .then(data => {
                setProjects(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--muted)]">
                <Loader2 className="w-8 h-8 animate-spin mb-2 text-[var(--accent)]" />
                <p>Cargando obras...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-neutral-800">Mis Obras</h2>
                    <p className="text-sm text-neutral-500 mt-1">Seleccioná un proyecto para comenzar a trabajar.</p>
                </div>
                {/* Optional: Add search or filters here later */}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {projects.map((project) => (
                    <button
                        key={project.id_licitacion}
                        onClick={() => onSelect(project)}
                        className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:border-orange-200 transition-all duration-300 group text-left overflow-hidden relative"
                    >
                        {/* Decorative Top Accent */}
                        <div className="h-1.5 w-full bg-gray-100 group-hover:bg-orange-500 transition-colors duration-300"></div>

                        <div className="p-6 flex-1 flex flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-colors duration-300 shadow-sm">
                                    <Building2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <span className="block font-bold text-neutral-800 text-lg leading-tight group-hover:text-orange-700 transition-colors">
                                        {project.nombre_abreviado}
                                    </span>
                                    <span className="inline-flex mt-1.5 items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                                        ID: {project.id_licitacion}
                                    </span>
                                </div>
                            </div>

                            <div className="hidden md:flex w-8 h-8 items-center justify-center rounded-full bg-gray-50 text-gray-400 group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">
                                <ChevronRight className="w-5 h-5" />
                            </div>
                        </div>

                        {/* Mobile Only footer or visual cue if needed, but for now clean card is best */}
                    </button>
                ))}
            </div>

            {projects.length === 0 && (
                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200">
                    <p className="text-neutral-400 text-sm">No tenés obras asignadas.</p>
                </div>
            )}
        </div>
    );
}
