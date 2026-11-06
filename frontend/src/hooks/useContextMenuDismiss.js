import { useEffect, useRef } from 'react';

/**
 * 우클릭(컨텍스트) 메뉴가 열려 있는 동안 바깥 클릭·스크롤·Escape로 메뉴를 닫습니다.
 * menuRef를 넘기면 메뉴가 열리거나 focusKey가 바뀔 때 [data-autofocus] 또는 첫 번째 버튼으로 포커스를 옮기고,
 * Escape로 닫을 때는 메뉴를 열기 직전에 포커스가 있던 요소로 포커스를 되돌립니다.
 */
export function useContextMenuDismiss(isOpen, onClose, { menuRef, focusKey } = {}) {
    // 호출부가 인라인 함수를 넘겨도 리스너를 다시 등록하지 않도록 최신 onClose를 ref로 참조합니다.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const returnFocusRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const close = () => onCloseRef.current();
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            const returnTarget = returnFocusRef.current;
            close();
            if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
        };
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !menuRef?.current) return;
        // preventScroll: 포커스 이동으로 스크롤이 발생하면 scroll 리스너가 메뉴를 바로 닫습니다.
        const target = menuRef.current.querySelector('[data-autofocus]') ?? menuRef.current.querySelector('button');
        target?.focus({ preventScroll: true });
    }, [isOpen, menuRef, focusKey]);
}
