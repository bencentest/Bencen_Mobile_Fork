import React, { useState, useEffect } from 'react';
import { X, Save, Loader2, AlertTriangle, Camera, Trash2, Image as ImageIcon } from 'lucide-react';
import { api } from '../services/api';
import imageCompression from 'browser-image-compression';

export function ProgressModal({ item, existingRange = null, editingEntry = null, onClose, onSuccess }) {
    const totalCantidad = Number(item?.cantidad) || 0;
    const unidad = item?.unidad || '';

    const pctFromQty = (qty) => {
        const q = Number(qty);
        if (!Number.isFinite(q) || totalCantidad <= 0) return '';
        return (q / totalCantidad) * 100;
    };

    const qtyFromPct = (pct) => {
        const p = Number(pct);
        if (!Number.isFinite(p) || totalCantidad <= 0) return '';
        return (p / 100) * totalCantidad;
    };

    // Canonical value remains % (partes_diarios.avance). Quantity is just a UX helper.
    const [avancePct, setAvancePct] = useState(editingEntry ? String(editingEntry.avance ?? '') : '');
    const [avanceQty, setAvanceQty] = useState(() => {
        if (!editingEntry || totalCantidad <= 0) return '';
        const qty = qtyFromPct(editingEntry.avance);
        return Number.isFinite(qty) ? String(qty) : '';
    });
    const [observaciones, setObservaciones] = useState(editingEntry ? editingEntry.observaciones : '');
    const [fechaInicio, setFechaInicio] = useState(editingEntry?.fecha_inicio || '');
    const [fechaFin, setFechaFin] = useState(editingEntry?.fecha_fin || '');
    const [photos, setPhotos] = useState(editingEntry?.photos || []);
    const [loading, setLoading] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [error, setError] = useState(null);
    const [dateWarning, setDateWarning] = useState(null);

    const fmt = (iso) => {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleDateString('es-AR');
        } catch {
            return String(iso);
        }
    };

    const updateWarning = (start, end) => {
        if (!existingRange?.minStart || !existingRange?.maxEnd || !start || !end) {
            setDateWarning(null);
            return;
        }

        const outside = end < existingRange.minStart || start > existingRange.maxEnd;
        if (!outside) {
            setDateWarning(null);
            return;
        }

        setDateWarning(
            `Aviso: este ítem tiene avances registrados entre ${fmt(existingRange.minStart)} y ${fmt(existingRange.maxEnd)}. ` +
            `Tu período (${fmt(start)} a ${fmt(end)}) está fuera de ese rango.`
        );
    };

    useEffect(() => {
        updateWarning(fechaInicio, fechaFin);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fechaInicio, fechaFin, existingRange?.minStart, existingRange?.maxEnd]);

    const handleImageSelect = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setUploadingImage(true);
        try {
            const newPhotos = [];
            for (const file of files) {
                // Compression
                const options = {
                    maxSizeMB: 0.8,
                    maxWidthOrHeight: 1280,
                    useWebWorker: true
                };
                const compressedFile = await imageCompression(file, options);

                // Upload
                const url = await api.uploadImage(compressedFile);
                newPhotos.push(url);
            }
            setPhotos(prev => [...prev, ...newPhotos]);
        } catch (error) {
            console.error(error);
            alert("Error al subir imagen: " + error.message);
        } finally {
            setUploadingImage(false);
        }
    };

    const removePhoto = (index) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        // Prefer % if provided, otherwise derive from quantity.
        let pct = avancePct;
        if ((pct === '' || pct === null || pct === undefined) && avanceQty !== '' && avanceQty !== null && avanceQty !== undefined) {
            const derived = pctFromQty(avanceQty);
            pct = derived === '' ? '' : String(derived);
        }

        const val = parseFloat(pct);
        if (isNaN(val) || val < 0 || val > 100) {
            setError("El avance debe ser un porcentaje entre 0 y 100 (o una cantidad válida).");
            return;
        }

        if (totalCantidad > 0 && avanceQty !== '' && avanceQty !== null && avanceQty !== undefined) {
            const q = parseFloat(avanceQty);
            if (isNaN(q) || q < 0) {
                setError("La cantidad debe ser un número válido.");
                return;
            }
            if (q > totalCantidad + 1e-9) {
                setError(`La cantidad no puede superar el total del ítem (${totalCantidad.toLocaleString('es-AR')} ${unidad}).`);
                return;
            }
        }

        if (!observaciones.trim()) {
            setError("La observación es obligatoria.");
            return;
        }

        if (!fechaInicio || !fechaFin) {
            setError("Debes seleccionar Fecha Inicio y Fecha Fin.");
            return;
        }

        if (fechaInicio > fechaFin) {
            setError("La fecha de inicio no puede ser posterior a la fecha de fin.");
            return;
        }

        setLoading(true);
        try {
            if (editingEntry) {
                // Update
                await api.updateProgress(editingEntry.id, {
                    avance: val,
                    observaciones,
                    fecha: editingEntry.fecha, // Keep original report date
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    photos
                });
            } else {
                // Create
                await api.saveProgress({
                    item_id: item.id,
                    id_licitacion: item.id_licitacion,
                    avance: val,
                    observaciones,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin,
                    photos
                });
            }
            onSuccess();
            onClose();
        } catch (err) {
            console.error(err);
            setError(err.message || "Error al guardar.");
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
                            {editingEntry ? 'Avance' : 'Avance de Hoy'}
                        </label>

                        {totalCantidad > 0 && (
                            <div className="relative mb-2">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={avanceQty}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setAvanceQty(next);
                                        const nextPct = pctFromQty(next);
                                        if (nextPct !== '') setAvancePct(String(nextPct));
                                    }}
                                    className="w-full h-11 pl-4 pr-16 rounded-xl border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)] text-base font-semibold"
                                    placeholder="Cantidad"
                                    autoFocus
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">
                                    {unidad}
                                </span>
                            </div>
                        )}
                        <div className="relative">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={avancePct}
                                onChange={e => {
                                    const next = e.target.value;
                                    setAvancePct(next);
                                    if (totalCantidad > 0) {
                                        const nextQty = qtyFromPct(next);
                                        if (nextQty !== '') setAvanceQty(String(nextQty));
                                    }
                                }}
                                className="w-full h-12 pl-4 pr-12 rounded-xl border-gray-300 focus:border-[var(--accent)] focus:ring-[var(--accent)] text-lg font-semibold"
                                placeholder="Ej: 15.5"
                                required={totalCantidad <= 0}
                                autoFocus={totalCantidad <= 0}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                        </div>

                        {totalCantidad > 0 && (
                            <p className="text-xs text-neutral-500 mt-1.5 ml-1">
                                Total item: <span className="font-semibold text-neutral-700">{totalCantidad.toLocaleString('es-AR')} {unidad}</span>. Podes cargar por cantidad o por % (se calculan entre si).
                            </p>
                        )}
                        <p className="text-xs text-neutral-500 mt-1.5 ml-1">
                            {editingEntry ? 'Modificá el porcentaje registrado.' : 'Ingresá el porcentaje ejecutado hoy (0 a 100).'}
                        </p>
                    </div>

                    {/* Periodo Inputs */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">Período del Avance <span className="text-red-500">*</span></label>
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <span className="text-xs text-gray-500 mb-1 block">Inicio</span>
                                <input
                                    type="date"
                                    required
                                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-[var(--accent)] focus:ring-[var(--accent)] outline-none"
                                    value={fechaInicio}
                                    onChange={e => {
                                        const next = e.target.value;
                                        setFechaInicio(next);
                                        // UX: al elegir "Desde", autocompletamos "Hasta" con la misma fecha.
                                        setFechaFin(next);
                                        updateWarning(next, next);
                                    }}
                                />
                            </div>
                            <div className="flex-1">
                                <span className="text-xs text-gray-500 mb-1 block">Fin</span>
                                <input
                                    type="date"
                                    required
                                    className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm focus:border-[var(--accent)] focus:ring-[var(--accent)] outline-none"
                                    value={fechaFin}
                                    onChange={e => {
                                        const next = e.target.value;
                                        setFechaFin(next);
                                        updateWarning(fechaInicio, next);
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {dateWarning && (
                        <div className="bg-amber-50 text-amber-800 text-sm p-3 rounded-xl border border-amber-200">
                            {dateWarning}
                        </div>
                    )}

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

                    {/* Photos Section */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-2">Evidencia Fotográfica</label>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {/* Add Button */}
                            <label className={`shrink-0 w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-[var(--accent)] hover:bg-orange-50 transition-colors ${uploadingImage ? 'opacity-50 pointer-events-none' : ''}`}>
                                {uploadingImage ? <Loader2 className="w-6 h-6 animate-spin text-gray-400" /> : <Camera className="w-6 h-6 text-gray-400" />}
                                <span className="text-[10px] font-bold text-gray-500">{uploadingImage ? '...' : 'Agregar'}</span>
                                <input type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                            </label>

                            {photos.map((url, index) => (
                                <div key={index} className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-gray-200 group">
                                    <img src={url} alt="evidencia" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removePhoto(index)}
                                        className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-600 rounded-full text-white transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl flex items-start gap-2">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || uploadingImage}
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
