import React, { useState } from 'react';
import { X, Save, Loader2, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

export function ProgressModal({ item, editingEntry = null, onClose, onSuccess }) {
    const [avance, setAvance] = useState(editingEntry ? editingEntry.avance : '');
    const [observaciones, setObservaciones] = useState(editingEntry ? editingEntry.observaciones : '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        const val = parseFloat(avance);
        if (isNaN(val) || val < 0 || val > 100) {
            setError("El avance debe ser un porcentaje entre 0 y 100.");
            return;
        }

        if (!observaciones.trim()) {
            setError("La observación es obligatoria.");
            return;
        }

        setLoading(true);
        try {
            if (editingEntry) {
                // Update
                await api.updateProgress(editingEntry.id, {
                    avance: val,
                    observaciones,
                    fecha: editingEntry.fecha // Keep original date or allow edit? Assuming keep simple for now or use current logic.
                    // The API updateProgress expects fecha. Let's pass what we have.
                });
            } else {
                // Create
                await api.saveProgress({
                    item_id: item.id,
                    id_licitacion: item.id_licitacion,
                    avance: val,
                    observaciones
                });
            }
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.message || "Error al guardar. Verificá que la suma no supere el 100%.");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="font-bold text-lg text-neutral-900">
                        {editingEntry ? 'Editar Avance' : 'Reportar Avance'}
                    </h3>
                    <button onClick={onClose} className="p-2 -mr-2 text-neutral-500 hover:text-neutral-800 rounded-full hover:bg-neutral-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">

                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                        <p className="text-xs font-mono font-bold text-[var(--accent)] mb-1">{item.item}</p>
                        <p className="text-sm font-medium text-neutral-800 leading-snug">{item.descripcion}</p>
                        <p className="text-xs text-neutral-500 mt-2">
                            Cantidad Total: <span className="font-semibold text-neutral-700">{Number(item.cantidad).toLocaleString('es-AR')} {item.unidad}</span>
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                            {editingEntry ? 'Porcentaje de Avance' : 'Porcentaje de Avance Hoy (%)'}
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={avance}
                                onChange={e => setAvance(e.target.value)}
                                className="w-full h-12 pl-4 pr-12 rounded-xl border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)] text-lg font-semibold"
                                placeholder="Ej: 15.5"
                                required
                                autoFocus
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-1.5 ml-1">
                            {editingEntry ? 'Modificá el porcentaje registrado.' : 'Ingresá el porcentaje ejecutado hoy (0 a 100).'}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Observaciones <span className="text-red-500">*</span></label>
                        <textarea
                            value={observaciones}
                            onChange={e => setObservaciones(e.target.value)}
                            className="w-full rounded-xl border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)] text-sm min-h-[80px] p-3 resize-none leading-relaxed"
                            placeholder="Detalles obligatorios sobre el avance..."
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 bg-[var(--accent)] hover:bg-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 disabled:opacity-70 transition-all active:scale-[0.98]"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {editingEntry ? 'Actualizar Avance' : 'Guardar Avance'}
                    </button>
                </form>
            </div>
        </div>
    );
}
