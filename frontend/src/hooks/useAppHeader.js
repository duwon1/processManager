import { createContext, useContext, useLayoutEffect } from 'react';

export const DEFAULT_HEADER = Object.freeze({
    title: '노드를 선택해주세요',
});

export const AppLayoutContext = createContext({
    setHeader: () => {},
});

export function useAppHeader(headerConfig) {
    const { setHeader } = useContext(AppLayoutContext);

    useLayoutEffect(() => {
        setHeader(headerConfig || DEFAULT_HEADER);
        return () => setHeader(DEFAULT_HEADER);
    }, [headerConfig, setHeader]);
}
