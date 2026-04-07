import { supabase } from '../../services/supabase';

function readHashParams() {
    const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;

    return new URLSearchParams(hash);
}

export const authRecoveryService = {
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange(callback);
    },

    async establishRecoverySession() {
        const url = new URL(window.location.href);
        const searchParams = url.searchParams;
        const hashParams = readHashParams();
        const code = searchParams.get('code');
        const errorDescription =
            searchParams.get('error_description') ||
            hashParams.get('error_description');

        if (errorDescription) {
            throw new Error(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
        }

        if (code) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
            return data.session;
        }

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
            });
            if (error) throw error;
            return data.session;
        }

        const tokenHash = searchParams.get('token_hash') || hashParams.get('token_hash');
        const type = searchParams.get('type') || hashParams.get('type');

        if (tokenHash && type) {
            const { data, error } = await supabase.auth.verifyOtp({
                token_hash: tokenHash,
                type,
            });
            if (error) throw error;
            return data.session;
        }

        return this.getSession();
    },

    async getSession() {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session;
    },

    async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        return true;
    },

    clearRecoveryUrl() {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, document.title, cleanUrl);
    },
};
