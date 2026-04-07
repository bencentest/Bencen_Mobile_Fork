import { useEffect, useRef, useState } from 'react';
import { authRecoveryService } from './authRecoveryService';

export function useResetPassword(onSuccess) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const verifyTimeoutRef = useRef(null);

    useEffect(() => {
        let isMounted = true;

        const verifyRecoverySession = async () => {
            try {
                const recoverySession = await authRecoveryService.establishRecoverySession();

                if (!isMounted) return;

                if (!recoverySession) {
                    setError('El enlace de recuperación no es válido o ya fue utilizado.');
                    return;
                }

                authRecoveryService.clearRecoveryUrl();
                setError('');
            } catch (err) {
                if (!isMounted) return;
                setError(err?.message || 'No se pudo verificar el enlace de recuperación.');
            } finally {
                if (isMounted) {
                    setVerifying(false);
                }
            }
        };

        const {
            data: { subscription },
        } = authRecoveryService.onAuthStateChange(async (event, session) => {
            if (event === 'PASSWORD_RECOVERY' || session) {
                if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
                setVerifying(false);
                setError('');
                return;
            }

            verifyTimeoutRef.current = setTimeout(async () => {
                try {
                    const currentSession = await authRecoveryService.getSession();
                    if (!currentSession) {
                        setError('El enlace de recuperación no es válido o ya fue utilizado.');
                    }
                } catch {
                    setError('No se pudo verificar la sesión de recuperación.');
                } finally {
                    setVerifying(false);
                }
            }, 1000);
        });

        verifyRecoverySession();

        return () => {
            isMounted = false;
            if (verifyTimeoutRef.current) clearTimeout(verifyTimeoutRef.current);
            subscription.unsubscribe();
        };
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await authRecoveryService.updatePassword(password);
            setSuccess(true);
            if (onSuccess) {
                setTimeout(() => onSuccess(), 3000);
            }
        } catch (err) {
            setError(err?.message || 'Error al actualizar la contraseña.');
        } finally {
            setLoading(false);
        }
    };

    return {
        password,
        setPassword,
        confirmPassword,
        setConfirmPassword,
        loading,
        verifying,
        error,
        success,
        handleSubmit,
    };
}
