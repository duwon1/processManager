import { useEffect, useState } from 'react';

export function useElementSize(ref) {
    const [size, setSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const element = ref.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;

        const updateSize = () => {
            const rect = element.getBoundingClientRect();
            const nextSize = {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            };

            setSize(prevSize => (
                prevSize.width === nextSize.width && prevSize.height === nextSize.height
                    ? prevSize
                    : nextSize
            ));
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(element);
        return () => observer.disconnect();
    }, [ref]);

    return size;
}
