import { useEffect, useState } from 'react';

export function useElementSize(ref) {
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;

        const updateSize = () => {
            const rect = element.getBoundingClientRect();
            setSize({
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            });
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);

    return size;
}
