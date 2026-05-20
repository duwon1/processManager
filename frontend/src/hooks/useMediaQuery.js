import { useEffect, useState } from 'react';

const getMatches = (query) => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : false
);

export function useMediaQuery(query) {
    const [matches, setMatches] = useState(() => getMatches(query));

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

        const mediaQuery = window.matchMedia(query);
        const handleChange = () => setMatches(prev => (
            prev === mediaQuery.matches ? prev : mediaQuery.matches
        ));
        handleChange();

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [query]);

    return matches;
}
