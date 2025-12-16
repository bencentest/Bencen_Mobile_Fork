import React from 'react';
import { Plus, History, ChevronLeft } from 'lucide-react';

export function ActionSelector({ project, onSelect, onBack }) {
    return (
        <div className="max-w-md mx-auto space-y-6">
            <div className='flex items-center gap-2 mb-4'>
                <button
                    onClick={onBack}
                    className="p-1.5 rounded-full bg-white text-neutral-500 hover:text-neutral-900 shadow-sm border border-gray-200"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-neutral-900">{project.nombre_abreviado}</h2>
                    <p className="text-xs text-neutral-500">Seleccioná una acción</p>
                </div>
            </div>

            <div className="space-y-4">
                <button
                    onClick={() => onSelect('add')}
                    className="w-full p-6 bg-orange-600 text-white rounded-2xl shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-between group"
                >
                    <div className="flex flex-col items-start gap-1">
                        <span className="font-bold text-lg">Cargar Avance</span>
                        <span className="text-orange-100 text-sm">Registrar progreso diario</span>
                    </div>
                    <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
                        <Plus className="w-7 h-7" />
                    </div>
                </button>

                <button
                    onClick={() => onSelect('history')}
                    className="w-full p-6 bg-white text-neutral-800 rounded-2xl shadow-sm border border-gray-200 active:scale-[0.98] transition-all flex items-center justify-between group hover:border-orange-200"
                >
                    <div className="flex flex-col items-start gap-1">
                        <span className="font-bold text-lg">Ver Estado Actual</span>
                        <span className="text-neutral-400 text-sm">Historial y acumulados</span>
                    </div>
                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors text-neutral-400">
                        <History className="w-7 h-7" />
                    </div>
                </button>
            </div>
        </div>
    );
}
