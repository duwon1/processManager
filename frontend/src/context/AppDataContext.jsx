/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useAuthFetch } from '../hooks/useAuthFetch';

const AppDataContext = createContext(null);

export function AppDataProvider({ children }) {
    const { accessToken, isAuthenticated } = useAuth();
    const authFetch = useAuthFetch();
    const [nodes, setNodes] = useState([]);
    const [teams, setTeams] = useState([]);
    const [profile, setProfile] = useState(null);

    const refreshNodes = useCallback(async () => {
        if (!accessToken || !isAuthenticated) {
            setNodes([]);
            return [];
        }
        try {
            const res = await authFetch('/api/node/list');
            const data = res?.ok ? await res.json() : [];
            const nextNodes = Array.isArray(data) ? data : [];
            setNodes(nextNodes);
            return nextNodes;
        } catch {
            setNodes([]);
            return [];
        }
    }, [accessToken, authFetch, isAuthenticated]);

    const refreshTeams = useCallback(async () => {
        if (!accessToken || !isAuthenticated) {
            setTeams([]);
            return [];
        }
        try {
            const res = await authFetch('/api/team/list');
            const data = res?.ok ? await res.json() : [];
            const nextTeams = Array.isArray(data) ? data : [];
            setTeams(nextTeams);
            return nextTeams;
        } catch {
            setTeams([]);
            return [];
        }
    }, [accessToken, authFetch, isAuthenticated]);

    const refreshProfile = useCallback(async () => {
        if (!accessToken || !isAuthenticated) {
            setProfile(null);
            return null;
        }
        try {
            const res = await authFetch('/api/user/me');
            const data = res?.ok ? await res.json() : null;
            setProfile(data);
            return data;
        } catch {
            setProfile(null);
            return null;
        }
    }, [accessToken, authFetch, isAuthenticated]);

    const refreshAll = useCallback(async () => {
        const [nextNodes, nextTeams, nextProfile] = await Promise.all([
            refreshNodes(),
            refreshTeams(),
            refreshProfile(),
        ]);
        return { nodes: nextNodes, teams: nextTeams, profile: nextProfile };
    }, [refreshNodes, refreshTeams, refreshProfile]);

    useEffect(() => {
        if (!accessToken || !isAuthenticated) {
            const timer = window.setTimeout(() => {
                setNodes([]);
                setTeams([]);
                setProfile(null);
            }, 0);
            return () => window.clearTimeout(timer);
        }

        const initialFetchId = window.setTimeout(refreshAll, 0);
        const intervalId = setInterval(() => {
            refreshNodes();
            refreshTeams();
        }, 5000);
        return () => {
            window.clearTimeout(initialFetchId);
            clearInterval(intervalId);
        };
    }, [accessToken, isAuthenticated, refreshAll, refreshNodes, refreshTeams]);

    const value = useMemo(() => ({
        nodes,
        teams,
        profile,
        refreshAll,
        refreshNodes,
        refreshTeams,
        refreshProfile,
        setTeams,
    }), [nodes, profile, refreshAll, refreshNodes, refreshProfile, refreshTeams, teams]);

    return (
        <AppDataContext.Provider value={value}>
            {children}
        </AppDataContext.Provider>
    );
}

export function useAppData() {
    const context = useContext(AppDataContext);
    if (!context) {
        throw new Error('useAppData는 AppDataProvider 안에서만 사용할 수 있습니다.');
    }
    return context;
}
